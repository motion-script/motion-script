import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type HalftoneEffect } from "@motion-script/core";

/** Shape selector passed to the shader — keep in sync with `HalftoneShape`. */
const SHAPE_ID: Record<HalftoneEffect["shape"], number> = {
    dot: 0,
    line: 1,
    cross: 2,
};

/** Plate-count selector — keep in sync with `HalftoneSeparation`. */
const SEPARATION_ID: Record<HalftoneEffect["separation"], number> = {
    mono: 0,
    rgb: 1,
    cmyk: 2,
};

/**
 * Halftone screen — tone reproduced as the *area* of a mark on a rotated grid,
 * the way offset printing does it.
 *
 * Each pixel is rotated into screen space, reduced to its cell, and compared
 * against a mark whose size comes from the local tone. Dot radius uses
 * `√(1 − tone)` because a disc's area grows with the square of its radius, so
 * the square root is what makes *coverage* linear in darkness — the difference
 * between a screen that holds its midtones and one that plugs up.
 *
 * `separation` picks the plate count. `'cmyk'` is the one that reads as printed:
 * the shared darkness moves onto a K plate, so a neutral tone prints one black
 * dot rather than three overlapping colour dots. The relative angles (15° / 75° /
 * 0° / 45°) are what produce a rosette instead of a moiré.
 *
 * The grid is anchored to the node's centre, not the surface origin, so the
 * screen travels with the node instead of the node sliding underneath it.
 */
const HALFTONE_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2   u_center;   // grid anchor, device px
uniform float  u_size;     // cell pitch, device px
uniform float  u_angle;    // screen rotation, radians
uniform float  u_shape;       // 0 = dot, 1 = line, 2 = cross
uniform float  u_separation;  // 0 = mono, 1 = rgb, 2 = cmyk

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Ink coverage (0-1) for 'tone' at this pixel, on a screen turned by 'offset'.
float coverage(vec2 fragCoord, float tone, float offset) {
    float a = u_angle + offset;
    float ca = cos(a);
    float sa = sin(a);
    vec2 d = fragCoord - u_center;
    vec2 q = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);

    float pitch = max(u_size, 1.0);
    float h = pitch * 0.5;
    vec2 cell = mod(q + h, pitch) - h;

    float ink = 1.0 - clamp(tone, 0.0, 1.0);
    float aa = max(pitch * 0.08, 0.75);

    if (u_shape < 0.5) {
        // Area-linear dot: radius ∝ √(ink), scaled so full ink covers the cell.
        float radius = sqrt(ink) * h * 1.35;
        return 1.0 - smoothstep(radius - aa, radius + aa, length(cell));
    }

    float bar = ink * h;
    float horizontal = 1.0 - smoothstep(bar - aa, bar + aa, abs(cell.y));
    if (u_shape < 1.5) return horizontal;

    float vertical = 1.0 - smoothstep(bar - aa, bar + aa, abs(cell.x));
    return max(horizontal, vertical);
}

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec3 base = c.rgb / c.a;                       // un-premultiply
    vec3 screened;

    if (u_separation > 1.5) {
        // Four-plate process separation. Pulling the common darkness out into a
        // K plate is the whole point: without it a neutral tone prints three
        // overlapping mid-dots (which is what 'rgb' does, and why it reads as
        // colour noise on anything grey). With K carrying it, a neutral prints
        // one black dot and almost no colour, and paper stays paper.
        float k = 1.0 - max(base.r, max(base.g, base.b));
        float inv = max(1.0 - k, 0.0001);           // guard pure black
        // C = (1 − R − K) / (1 − K), and likewise M, Y. The division rescales
        // what's left after K has taken the common darkness, so the channel that
        // was brightest ends up with no ink at all.
        vec3 cmy = clamp((vec3(1.0) - base - vec3(k)) / inv, 0.0, 1.0);

        // Ink amounts, so pass 1 - amount: 'coverage' takes tone, not ink.
        float dotC = coverage(fragCoord, 1.0 - cmy.r, 0.2617994);   // +15°
        float dotM = coverage(fragCoord, 1.0 - cmy.g, 1.3089969);   // +75°
        float dotY = coverage(fragCoord, 1.0 - cmy.b, 0.0);         //   0°
        float dotK = coverage(fragCoord, 1.0 - k,     0.7853982);   // +45°

        // Subtractive: each ink absorbs its complementary channel — cyan takes
        // red, magenta green, yellow blue — and black takes all three.
        screened = vec3(1.0 - dotC, 1.0 - dotM, 1.0 - dotY) * (1.0 - dotK);
    } else if (u_separation > 0.5) {
        screened = vec3(
            1.0 - coverage(fragCoord, base.r, 0.2617994),   // +15°
            1.0 - coverage(fragCoord, base.g, 1.3089969),   // +75°
            1.0 - coverage(fragCoord, base.b, 0.0)
        );
    } else {
        screened = vec3(1.0 - coverage(fragCoord, dot(base, LUMA), 0.0));
    }

    return vec4(clamp(screened, 0.0, 1.0) * c.a, c.a);   // re-premultiply
}
`;

/**
 * Build the paint shader that redraws the source as a halftone screen. Returns
 * null when the cell pitch is degenerate (a sub-pixel cell has no mark to draw).
 */
export function makeHalftoneShader(
    effect: HalftoneEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    const pitch = effect.size * geom.scale;
    if (!(pitch >= 1)) return null;

    const runtimeEffect = getOrCompileSkSL(HALFTONE_SKSL, ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [
            geom.centerX, geom.centerY,
            pitch,
            (effect.angle * Math.PI) / 180,
            SHAPE_ID[effect.shape] ?? 0,
            SEPARATION_ID[effect.separation] ?? 0,
        ],
        [content],
    );
}

/** Halftone screen, on the node's own content or on the backdrop beneath it. */
export const halftoneEffectHandler: EffectHandler<HalftoneEffect> = {
    type: "halftone",
    sampling: { tileMode: "decal", filterMode: "linear" },
    makeShader: (effect, ck, content, geom) => makeHalftoneShader(effect, ck, content, geom),
};
