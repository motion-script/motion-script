import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import type { CurvesEffect, CurvesFilter, CurvesChannel } from "@motion-script/core";
import { getOrCompileSkSL } from "../../sksl-cache";
import type { EffectHandler } from "../../effects/handler";

/**
 * Evaluate a piecewise-linear curve at x ∈ [0, 1].
 * Assumes `points` are sorted by their x coordinate.
 */
function evalCurve(points: [number, number][], x: number): number {
    if (points.length === 0) return x;
    if (x <= points[0][0]) return points[0][1];
    const last = points[points.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        if (x >= x0 && x <= x1) {
            const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * t;
        }
    }
    return x;
}

/**
 * Segments the curve is resampled onto for the shader.
 *
 * The control points are wherever the author put them; the uniform is a *ramp*,
 * evenly spaced, because an evenly spaced table is what makes the lookup a
 * multiply and an index rather than a search. 32 segments is finer than a
 * hand-authored curve's own knots and finer than the 8-bit surface it is
 * resolved onto: between two adjacent samples the chord and the curve differ by
 * less than a level.
 */
const SEGMENTS = 32;

/** The curve as `SEGMENTS + 1` evenly spaced outputs over the 0–1 domain. */
function ramp(points: [number, number][]): number[] {
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const out: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
        const y = evalCurve(sorted, i / SEGMENTS);
        out.push(Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : i / SEGMENTS);
    }
    return out;
}

/** Whether a ramp is close enough to the diagonal to be worth skipping entirely. */
function isIdentity(values: number[]): boolean {
    return values.every((y, i) => Math.abs(y - i / SEGMENTS) < 1e-4);
}

/** Which channels a curve drives, as the mask the shader mixes with. */
function mask(channel: CurvesChannel): [number, number, number, number] {
    switch (channel) {
        case "r": return [1, 0, 0, 0];
        case "g": return [0, 1, 0, 0];
        case "b": return [0, 0, 1, 0];
        case "a": return [0, 0, 0, 1];
        default: return [1, 1, 1, 0];
    }
}

/**
 * The curve, evaluated per pixel.
 *
 * ## The lookup is a telescoping sum, not a search
 *
 * SkSL runs under ES2 rules, so a table lookup cannot branch on a computed index
 * — and a `for` over the segments would have to index the uniform array by the
 * loop variable, which is exactly the construct different Skia versions have
 * disagreed about. Both problems disappear if the segments are *added up*
 * instead of selected between:
 *
 *     y = y₀ + Σᵢ (yᵢ₊₁ − yᵢ) · clamp(t − i, 0, 1)
 *
 * Every segment below `t` contributes its whole rise, the one containing `t`
 * contributes its fraction, and the ones above contribute nothing — which is the
 * definition of piecewise-linear interpolation, written with no branch and no
 * dynamic index. The sum is unrolled here into literal indices, the same thing
 * `trails` does with its per-tap weights and for the same reason.
 *
 * It also costs one `mix` to serve all four channels: `t` is a `vec4`, so red,
 * green, blue and alpha are looked up in the same instructions and the channel
 * the curve targets is chosen by a mask rather than by four shader variants.
 */
function source(): string {
    const sum = Array.from({ length: SEGMENTS }, (_, i) =>
        `    y += (u_curve[${i + 1}] - u_curve[${i}]) * clamp(t - ${i}.0, 0.0, 1.0);`,
    ).join("\n");

    // Widest-first, and the array last: Skia aligns runtime-effect uniforms, so a
    // narrow uniform ahead of a wide one leaves a gap the flat float array handed
    // to makeShader does not have, and every uniform after it reads garbage. See
    // the same note on `dotGrid`.
    return `
uniform shader u_content;
uniform vec4  u_mask;               // 1 on the channels this curve drives
uniform float u_curve[${SEGMENTS + 1}];        // the curve, evenly spaced over 0–1

vec4 lookup(vec4 c) {
    vec4 t = clamp(c, 0.0, 1.0) * ${SEGMENTS}.0;
    vec4 y = vec4(u_curve[0]);
${sum}
    return y;
}

vec4 main(vec2 p) {
    vec4 src = u_content.eval(p);
    // Nothing to grade, and dividing by zero alpha would make a NaN that spreads.
    if (src.a <= 0.0) return src;

    // A curve is defined on straight colour; the shader is handed (and must
    // return) premultiplied. The alpha it is remultiplied by is the *curved*
    // one, so a curve on the alpha channel means what it says.
    vec4 straight = vec4(src.rgb / src.a, src.a);
    vec4 curved = mix(straight, lookup(straight), u_mask);
    return vec4(clamp(curved.rgb, 0.0, 1.0) * curved.a, curved.a);
}
`;
}

/**
 * Applies a per-channel tone curve.
 *
 * Serves both the media-fill filter and the scene effect — they are the same
 * `{ points, channel }` adjustment, and sharing one handler is what keeps
 * `Adjustments.curves` and `Effects.curves` from drifting into two different
 * curves.
 *
 * ## Why this is a lens and not a colour filter
 *
 * It used to be one: the curve was collapsed to a single least-squares straight
 * line and applied as a 4×5 colour matrix, because Skia's WASM build exposes
 * neither `SkColorFilters::Table` nor a way to turn a runtime effect into a
 * colour filter. That is a fit, not the curve — and the error is not small where
 * it matters. A curve is *authored* for its knee: an S is a straight line plus
 * the two bends that are the entire point of drawing one, and the fit throws
 * away exactly those and keeps the line. Anything that saturates — a clamp, a
 * lifted toe, a rolled shoulder — came out as a flat wash of the average slope.
 * `exposure` was moved off a baked curve for precisely this reason; everything
 * still baking into one (lift/gamma/gain, whites & blacks, an off-pivot
 * contrast) was quietly paying the same cost.
 *
 * A runtime effect *can* be a shader, so the curve becomes a lens over its
 * source instead, and is then exact per pixel.
 *
 * ## What that costs
 *
 * A lens is a pass rather than a link in a colour-filter chain, so a stack of
 * curves is a stack of passes. More importantly it changes *where* a curve sits
 * relative to its neighbours: on a media fill every lens runs before the
 * composed `ImageFilter` (see `applyMediaFilters`, which documents why — there
 * is no way to feed a filter's output back in as a child shader), and on a node
 * the foreground filters ride the transform layer beneath the shader scopes. So
 * a curve now composes with the colour-matrix adjustments in surface order
 * rather than author order — the same rule `lut`, `oilPaint` and every other
 * resampler here already follow. That is a real trade, and it is the right way
 * round: a curve in a slightly different place in the chain is a grade, and a
 * curve flattened to its own average slope is not.
 */
export const curvesEffectHandler: EffectHandler<CurvesFilter | CurvesEffect> = {
    type: "curves",
    // Linear, for `lut`'s reason: nearest would quantise the *source* before it
    // is looked up, throwing away the precision the interpolation preserves.
    sampling: { tileMode: "clamp", filterMode: "linear" },

    makeShader(effect, ck: CanvasKit, content: Shader): Shader | null {
        const values = ramp(effect.points ?? []);
        // The state every tween-it-on-from-nothing starts in, and the state three
        // of the four channel curves sit in whenever one of them is being used.
        // Declining leaves the source untouched and costs no pass at all.
        if (isIdentity(values)) return null;

        const rte = getOrCompileSkSL(source(), ck);
        if (!rte) return null;
        return rte.makeShaderWithChildren(
            [...mask(effect.channel ?? "rgb"), ...values],
            [content],
        );
    },
};
