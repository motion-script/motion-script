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
 * Each pixel is rotated into screen space and reduced to its cell, and a mark is
 * drawn whose size comes from that **cell's** tone. Dot radius uses `√(1 − tone)`
 * because a disc's area grows with the square of its radius, so the square root
 * is what makes *coverage* linear in darkness — the difference between a screen
 * that holds its midtones and one that plugs up.
 *
 * The tone is resolved once **per cell**, not per pixel. A screen's resolution
 * *is* its cell pitch: one cell carries one tone, as one dot of ink does.
 * Reading it per fragment instead gives every pixel around a dot's rim a
 * slightly different radius to compare against, so the mark comes out ragged and
 * the lattice beats against any gradient underneath it — which is what made
 * small pitches look noisy rather than printed. Photoshop's and After Effects'
 * Color Halftone resolve a cell the same way.
 *
 * `separation` picks the plate count. `'cmyk'` is the one that reads as printed:
 * the shared darkness moves onto a K plate, so a neutral tone prints one black
 * dot rather than three overlapping colour dots. The relative angles (15° / 75° /
 * 0° / 45°) are what produce a rosette instead of a moiré. Each plate resolves
 * its tone over its *own* cell, since each is on a differently rotated grid.
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

// Screen-plate angles, relative to u_angle. Shared by the RGB and CMYK paths.
const float ANGLE_A = 0.2617994;   // +15°
const float ANGLE_B = 1.3089969;   // +75°
const float ANGLE_C = 0.0;         //   0°
const float ANGLE_K = 0.7853982;   // +45°

/**
 * The screen cell 'fragCoord' falls in, on the plate turned by 'offset'.
 * xy = this pixel's offset from the cell centre, in screen space (where the mark
 * is drawn); zw = that same centre mapped back to content space (where the
 * cell's one tone is resolved).
 */
vec4 screenCell(vec2 fragCoord, float offset) {
    float a = u_angle + offset;
    float ca = cos(a);
    float sa = sin(a);
    vec2 d = fragCoord - u_center;
    vec2 q = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);

    float pitch = max(u_size, 1.0);
    float h = pitch * 0.5;
    vec2 cell = mod(q + h, pitch) - h;

    vec2 qc = q - cell;                                            // centre, screen space
    vec2 dc = vec2(qc.x * ca + qc.y * sa, -qc.x * sa + qc.y * ca); // rotate back
    return vec4(cell, u_center + dc);
}

/**
 * The cell's tone: the mean of a 2x2 grid at its quartile points.
 *
 * Not a single tap at the centre. A cell covers pitch² pixels, and one tap can
 * only ever be one of them — everything else in the cell is dropped, so fine
 * detail flickers in and out depending on whether it happened to land under the
 * sample. Four taps at ±pitch/4 is the cheap standard box approximation (exact
 * for content that ramps linearly across the cell) and is what puts detail back
 * without giving up one-tone-per-cell.
 *
 * The offsets are rotated with the plate so the sample grid follows the screen
 * rather than the pixel axes. Taps landing outside the silhouette are skipped:
 * a cell straddling the edge would otherwise average toward transparent black,
 * read as full ink, and ring the artwork in a dark fringe. A cell with no valid
 * tap at all falls back to the pixel's own colour.
 */
vec3 cellTone(vec2 centre, float offset, vec3 fallback) {
    float a = u_angle + offset;
    float ca = cos(a);
    float sa = sin(a);
    float o = max(u_size, 1.0) * 0.25;

    vec3 sum = vec3(0.0);
    float n = 0.0;
    for (int i = 0; i < 4; i++) {
        vec2 t = vec2((i == 1 || i == 3) ? o : -o, (i < 2) ? -o : o);
        vec2 d = vec2(t.x * ca + t.y * sa, -t.x * sa + t.y * ca);
        vec4 s = u_content.eval(centre + d);
        if (s.a <= 0.0) continue;
        sum += s.rgb / s.a;
        n += 1.0;
    }
    return n > 0.0 ? sum / n : fallback;
}

/** Ink coverage (0-1) for 'tone', given this pixel's offset from its cell centre. */
float coverage(vec2 cell, float tone) {
    float pitch = max(u_size, 1.0);
    float h = pitch * 0.5;

    float ink = 1.0 - clamp(tone, 0.0, 1.0);
    // At least a full pixel of edge ramp. Below that a lattice of hard-edged
    // marks aliases against the pixel grid, which is exactly the shimmer a
    // small pitch used to show.
    float aa = max(pitch * 0.08, 1.25);

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

/**
 * Ink amounts for a colour: cyan, magenta, yellow in xyz, black in w.
 *
 * Pulling the common darkness out into a K plate is the whole point of the
 * four-plate path: without it a neutral tone prints three overlapping mid-dots
 * (which is what 'rgb' does, and why it reads as colour noise on anything grey).
 * With K carrying it, a neutral prints one black dot and almost no colour, and
 * paper stays paper.
 */
vec4 separate(vec3 base) {
    float k = 1.0 - max(base.r, max(base.g, base.b));
    float inv = max(1.0 - k, 0.0001);           // guard pure black
    // C = (1 − R − K) / (1 − K), and likewise M, Y. The division rescales what's
    // left after K has taken the common darkness, so the channel that was
    // brightest ends up with no ink at all.
    vec3 cmy = clamp((vec3(1.0) - base - vec3(k)) / inv, 0.0, 1.0);
    return vec4(cmy, k);
}

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec3 here = c.rgb / c.a;                       // un-premultiply
    vec3 screened;

    if (u_separation > 1.5) {
        vec4 cellC = screenCell(fragCoord, ANGLE_A);
        vec4 cellM = screenCell(fragCoord, ANGLE_B);
        vec4 cellY = screenCell(fragCoord, ANGLE_C);
        vec4 cellK = screenCell(fragCoord, ANGLE_K);

        // 'separate' gives ink amounts; 'coverage' takes tone, so pass 1 - ink.
        float dotC = coverage(cellC.xy, 1.0 - separate(cellTone(cellC.zw, ANGLE_A, here)).x);
        float dotM = coverage(cellM.xy, 1.0 - separate(cellTone(cellM.zw, ANGLE_B, here)).y);
        float dotY = coverage(cellY.xy, 1.0 - separate(cellTone(cellY.zw, ANGLE_C, here)).z);
        float dotK = coverage(cellK.xy, 1.0 - separate(cellTone(cellK.zw, ANGLE_K, here)).w);

        // Subtractive: each ink absorbs its complementary channel — cyan takes
        // red, magenta green, yellow blue — and black takes all three.
        screened = vec3(1.0 - dotC, 1.0 - dotM, 1.0 - dotY) * (1.0 - dotK);
    } else if (u_separation > 0.5) {
        vec4 cellR = screenCell(fragCoord, ANGLE_A);
        vec4 cellG = screenCell(fragCoord, ANGLE_B);
        vec4 cellB = screenCell(fragCoord, ANGLE_C);

        screened = vec3(
            1.0 - coverage(cellR.xy, cellTone(cellR.zw, ANGLE_A, here).r),
            1.0 - coverage(cellG.xy, cellTone(cellG.zw, ANGLE_B, here).g),
            1.0 - coverage(cellB.xy, cellTone(cellB.zw, ANGLE_C, here).b)
        );
    } else {
        vec4 cell = screenCell(fragCoord, ANGLE_C);
        screened = vec3(1.0 - coverage(cell.xy, dot(cellTone(cell.zw, ANGLE_C, here), LUMA)));
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
