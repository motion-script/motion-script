import type { FractalNoiseFillResolved } from "@motion-script/core";
import type { Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "@motion-script/skia-render/sksl-cache";
import { FillRenderer, type FillRendererContext } from "./renderer";

/** Ceiling on ramp stops the shader carries as uniforms. */
const MAX_STOPS = 8;

/**
 * Shared noise primitives.
 *
 * `hash2` is the standard sin-fract trick, decorrelated on both axes. Value and
 * simplex noise both build on it; worley uses it to place one feature point per
 * cell.
 *
 * Simplex here is the 2D skewed-grid formulation — three corner contributions
 * rather than the four bilinear taps value noise needs — which is what removes
 * the axis-aligned blockiness value noise shows at low octave counts.
 */
const NOISE_LIB = `
vec2 hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic smoothstep: its first *and* second derivatives vanish at the cell
    // edges, so summed octaves show no grid creases the way cubic ones do.
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash1(i);
    float b = hash1(i + vec2(1.0, 0.0));
    float c = hash1(i + vec2(0.0, 1.0));
    float d = hash1(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float simplexNoise(vec2 p) {
    const float K1 = 0.366025404;   // (sqrt(3) - 1) / 2
    const float K2 = 0.211324865;   // (3 - sqrt(3)) / 6

    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - (i - (i.x + i.y) * K2);
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;

    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 g = vec3(
        dot(a, hash2(i)          * 2.0 - 1.0),
        dot(b, hash2(i + o)      * 2.0 - 1.0),
        dot(c, hash2(i + 1.0)    * 2.0 - 1.0)
    );
    return dot(h * h * h * h * g, vec3(70.0)) * 0.5 + 0.5;
}

float worleyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float best = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 cell = vec2(float(x), float(y));
            vec2 point = hash2(i + cell);
            best = min(best, length(cell + point - f));
        }
    }
    return best;
}
`;

/**
 * Build the fill shader for a given basis, octave count and stop count.
 *
 * All three are baked into the source rather than passed as uniforms: SkSL wants
 * compile-time loop bounds and array sizes, and `getOrCompileSkSL` keys by source
 * so each distinct combination compiles exactly once. It is also why `basis`,
 * `octaves` and the stop count snap rather than interpolating in the fill's
 * `lerp` — tweening any of them would compile a program per frame.
 *
 * `ridged` gets its **own accumulation**, not just a different sample expression.
 * Folding simplex about its midpoint (`1 − |2n − 1|`) turns the noise's zero
 * crossings into crests, but plainly summing those octaves is nearly flat: each
 * octave concentrates around the fold's mean, and averaging five of them
 * concentrates it far harder, so the whole field lands in the top of the ramp and
 * reads as a solid colour. The Musgrave weighting — square each octave and
 * multiply it by the previous one — is what restores the range, because a crest
 * only survives where the coarser octave was *also* a crest. That is also what
 * produces the sharp branching ridges the basis is named for.
 */
function source(basis: string, octaves: number, stops: number): string {
    const sample =
        basis === "value" ? "valueNoise(q)"
            : basis === "worley" ? "worleyNoise(q)"
                : "simplexNoise(q)";

    const accumulate = basis === "ridged"
        ? `
    float prev = 1.0;
    for (int o = 0; o < ${octaves}; o++) {
        float r = 1.0 - abs(simplexNoise(q) * 2.0 - 1.0);
        r = r * r * prev;
        prev = clamp(r, 0.0, 1.0);
        sum += r * amplitude;
        total += amplitude;
        amplitude *= u_gain;
        q *= u_lacunarity;
    }`
        : `
    for (int o = 0; o < ${octaves}; o++) {
        sum += ${sample} * amplitude;
        total += amplitude;
        amplitude *= u_gain;
        q *= u_lacunarity;
    }`;

    return `${NOISE_LIB}
uniform vec2  u_origin;      // shape bounds origin, device px
uniform vec2  u_size;        // shape bounds size, device px
uniform vec2  u_frequency;   // cycles of the first octave across the shape
uniform vec2  u_offset;      // pan through the field, in cycles
uniform float u_lacunarity;
uniform float u_gain;
uniform float u_seed;
uniform float u_cos;         // field rotation, precomputed
uniform float u_sin;
uniform float u_contrast;
uniform float u_alpha;       // fill opacity × worldAlpha
uniform vec4  u_colors[${stops}];
uniform float u_stops[${stops}];

vec4 main(vec2 fragCoord) {
    // Normalised to the shape's own box, so the field is pinned to the figure
    // and u_frequency means "cycles across this shape" at any size.
    vec2 uv = (fragCoord - u_origin) / max(u_size, vec2(1.0));

    vec2 r = vec2(uv.x * u_cos - uv.y * u_sin, uv.x * u_sin + uv.y * u_cos);
    vec2 base = r * u_frequency + u_offset + u_seed;

    float sum = 0.0;
    float amplitude = 1.0;
    float total = 0.0;
    vec2 q = base;
${accumulate}
    // Normalising by the summed amplitudes keeps the field in 0–1 whatever the
    // gain, so changing octaves or gain re-textures without also re-exposing.
    float n = clamp(sum / max(total, 0.0001), 0.0, 1.0);

    // Contrast about the midpoint, so steepening does not also brighten.
    n = clamp((n - 0.5) * u_contrast + 0.5, 0.0, 1.0);

    vec4 color = u_colors[0];
    for (int i = 1; i < ${stops}; i++) {
        float t = clamp((n - u_stops[i - 1]) / max(u_stops[i] - u_stops[i - 1], 0.0001), 0.0, 1.0);
        color = mix(color, u_colors[i], step(u_stops[i - 1], n) * t);
    }

    // Premultiply: the paint's shader output is composited as premultiplied.
    float a = color.a * u_alpha;
    return vec4(color.rgb * a, a);
}
`;
}

/**
 * Fractal (fBm) noise fill — the first fill rendered by a shader rather than by
 * generating pixels on the CPU.
 *
 * That is deliberate: the speckle `NoiseFillRenderer` paints is one hash per
 * pixel and cheap enough in JS, but fBm is `octaves` hashes per pixel, which at
 * 1080p is tens of millions per frame. It also means the field costs nothing to
 * animate — `offset` and `seed` are uniforms, so a flowing field is not a
 * per-frame texture rebuild the way an animated speckle fill would be.
 */
export class FractalNoiseFillRenderer extends FillRenderer<FractalNoiseFillResolved> {
    /**
     * The shader built for the fill drawn most recently.
     *
     * Not cached by key, unlike the gradient renderers: an animated field
     * changes its uniforms every frame, so a keyed cache would allocate a shader
     * per frame and never hit. Instead exactly one is kept alive and released
     * when the next fill is configured — by which point the previous fill's
     * shapes have been drawn, since the handler paints each fill before moving
     * to the next.
     */
    private live: Shader | null = null;

    private replaceLive(shader: Shader | null): void {
        this.live?.delete();
        this.live = shader;
    }

    applyPaint(fill: FractalNoiseFillResolved, ctx: FillRendererContext): boolean {
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (width <= 0 || height <= 0) return false;

        const stops = Math.max(2, Math.min(MAX_STOPS, fill.colors.length));
        const runtimeEffect = getOrCompileSkSL(
            source(fill.basis, fill.octaves, stops),
            ctx.canvasKit,
        );
        if (!runtimeEffect) return false;

        const radians = (fill.angle * Math.PI) / 180;
        const alpha = (fill.opacity ?? 1) * ctx.worldAlpha;

        // Pad a short colour list by repeating the last entry rather than
        // leaving zeroed uniforms, which would ramp into transparent black.
        const colors: number[] = [];
        const positions: number[] = [];
        for (let i = 0; i < stops; i++) {
            const c = fill.colors[Math.min(i, fill.colors.length - 1)];
            colors.push(c[0], c[1], c[2], c[3]);
            positions.push(fill.stops[Math.min(i, fill.stops.length - 1)] ?? i / (stops - 1));
        }

        const shader = runtimeEffect.makeShader([
            bounds.left, bounds.top,
            width, height,
            fill.frequency.x, fill.frequency.y,
            fill.offset.x, fill.offset.y,
            fill.lacunarity,
            fill.gain,
            fill.seed,
            Math.cos(radians), Math.sin(radians),
            fill.contrast,
            alpha,
            ...colors,
            ...positions,
        ]);
        if (!shader) return false;

        this.replaceLive(shader);
        ctx.paint.setShader(shader);
        return true;
    }

    dispose(): void {
        this.replaceLive(null);
    }
}
