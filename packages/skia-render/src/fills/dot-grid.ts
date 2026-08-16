import type { DotGridFillResolved } from "@motion-script/core";
import type { Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { featherPx, FillRenderer, type FillRendererContext } from "./renderer";

/**
 * One dot per lattice cell, antialiased against the device grid.
 *
 * `u_feather` is the width of the coverage ramp in **shape-local px**, handed in
 * as one device pixel converted back through the live canvas scale. Hard-coding
 * a 1px ramp instead would blur the dots at high zoom (the ramp would cover many
 * device pixels) and alias them at low zoom, which is the whole reason a
 * resolution-independent shader is worth having over a baked tile.
 *
 * Output is premultiplied and deliberately *not* multiplied by the fill's
 * opacity or the world alpha — `FillHandler` has already put both on the paint
 * and Skia modulates a shader's output by the paint alpha, so folding them in
 * here would square them.
 */
const SOURCE = `
// Declared widest-first — vec4, then vec2s, then floats.
//
// Skia lays runtime-effect uniforms out with alignment, so a vec4 declared after
// an odd number of floats starts at the next 4-float boundary and the values fed
// to makeShader (a flat, padding-free array) land one or two slots off. Every
// uniform after the gap then reads garbage, which for a coverage shader means a
// solid block rather than an error. Ordering by width leaves no gap to pad, so
// the flat array and the layout agree by construction.
uniform vec4  u_color;
uniform vec2  u_origin;    // shape bounds origin, shape-local logical px
uniform vec2  u_offset;    // lattice shift, logical px
uniform float u_spacing;   // lattice pitch, logical px
uniform float u_radius;    // dot radius, logical px
uniform float u_feather;   // coverage ramp width, logical px

vec4 main(vec2 fragCoord) {
    // A radius of zero is a lattice switched off, and has to be answered before
    // the ramp: the ramp is centred on the dot's edge, so a zero-radius dot still
    // lands half a pixel of coverage on the pixel it sits in.
    if (u_radius <= 0.0) return vec4(0.0);

    vec2 p = fragCoord - u_origin - u_offset;
    // Distance from the centre of the cell this pixel falls in. SkSL's mod is
    // floor-based, so this holds for negative coordinates too — which is what a
    // shape left of the origin, or a negative offset, produces.
    vec2 d = mod(p, u_spacing) - u_spacing * 0.5;

    float cover = clamp((u_radius - length(d)) / u_feather + 0.5, 0.0, 1.0);
    float a = u_color.a * cover;
    return vec4(u_color.rgb * a, a);
}
`;

/**
 * Dot-grid fill — a lattice of dots at a pixel pitch.
 *
 * Shader-rendered rather than tiled, like the fractal noise fill and unlike the
 * stripe one: the pitch is a float and the dots are round, so a baked tile would
 * have to round the period to whole pixels (drifting the lattice across a wide
 * shape) and rebake on every frame of a tween of `spacing`, `radius` or
 * `offset`. As uniforms all three animate for free.
 */
export class DotGridFillRenderer extends FillRenderer<DotGridFillResolved> {
    /**
     * The shader built for the fill drawn most recently.
     *
     * One live instance rather than a keyed cache, for the reason
     * {@link FractalNoiseFillRenderer} keeps one: an animated lattice changes its
     * uniforms every frame, so a cache would allocate per frame and never hit.
     * The previous fill's shapes are already drawn by the time the next fill is
     * configured, so releasing it here is safe.
     */
    private live: Shader | null = null;

    private replaceLive(shader: Shader | null): void {
        this.live?.delete();
        this.live = shader;
    }

    applyPaint(fill: DotGridFillResolved, ctx: FillRendererContext): boolean {
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const effect = getOrCompileSkSL(SOURCE, ctx.canvasKit);
        if (!effect) return false;

        // A zero pitch is a lattice with no period — `mod` by it is undefined and
        // the fill would paint garbage. Clamped rather than skipped so dragging
        // the field to 0 leaves something on screen.
        const spacing = Math.max(0.01, fill.spacing);
        // Order matches the shader's declarations exactly — see the note there.
        const shader = effect.makeShader([
            fill.color[0], fill.color[1], fill.color[2], fill.color[3],
            bounds.left, bounds.top,
            fill.offset.x, fill.offset.y,
            spacing,
            Math.max(0, fill.radius),
            featherPx(ctx),
        ]);
        if (!shader) return false;

        this.replaceLive(shader);
        ctx.paint.setShader(shader);
        return true;
    }

    override dispose(): void {
        this.replaceLive(null);
    }
}
