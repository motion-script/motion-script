import type { EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type GrainEffect } from "@motion-script/core";
import { patternOrigin } from "./pattern-origin";

/**
 * Film grain: signed per-pixel noise added to the source.
 *
 * A hash of the grain *cell* (the pixel coordinate quantised by `u_size`)
 * supplies the noise, so the field is stable under repeated draws of the same
 * frame — two renders of frame 40 produce identical grain — while `u_seed`
 * shifts it wholesale. Centring the noise on zero means the grain lightens as
 * often as it darkens, leaving average exposure alone; scaling nothing by alpha
 * is unnecessary because a transparent pixel returns early.
 *
 * The cell is counted from the **node's own corner**, not from the screen's —
 * see {@link patternOrigin}. Grain measured in device pixels is grain the node
 * slides through as it moves, which reads as the film boiling every time
 * anything is animated across the frame; measured from the node it is a texture
 * *on* the node, which is what grain physically is.
 *
 * The sin-fract hash is the standard GPU trick: cheap, no texture, and
 * decorrelated enough at these amplitudes that the eye reads it as film rather
 * than as a pattern.
 */
const GRAIN_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2   u_origin;   // node box top-left, device px (0,0 on a backdrop)
uniform float  u_amount;   // noise amplitude, 0–1
uniform float  u_size;     // grain cell size, device px
uniform float  u_seed;     // field offset
uniform float  u_colored;  // 1 = per-channel speckle, 0 = luminance noise

float hash(vec2 cell, float seed) {
    return fract(sin(dot(cell, vec2(127.1, 311.7)) + seed * 13.7) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    vec2 cell = floor((fragCoord - u_origin) / max(u_size, 1.0));
    float n = hash(cell, u_seed) - 0.5;
    vec3 noise = vec3(n);
    if (u_colored > 0.5) {
        noise = vec3(
            n,
            hash(cell + vec2(37.0, 17.0), u_seed) - 0.5,
            hash(cell + vec2(11.0, 91.0), u_seed) - 0.5
        );
    }

    vec3 base = c.rgb / c.a;                                    // un-premultiply
    vec3 grained = clamp(base + noise * u_amount, 0.0, 1.0);
    return vec4(grained * c.a, c.a);                            // re-premultiply
}
`;

/**
 * Build the paint shader that draws the source with grain over it. Returns null
 * when the amplitude is zero.
 *
 * `animated` folds the node's elapsed time into the seed. Quantising to
 * milliseconds gives a distinct field per frame at any frame rate while keeping
 * a *re*-render of the same timestamp identical — important for the exporter,
 * which may draw a frame more than once.
 */
export function makeGrainShader(
    effect: GrainEffect,
    ck: CanvasKit,
    content: Shader,
    scale: number,
    time: number,
    origin: readonly [number, number] = [0, 0],
): Shader | null {
    if (!(effect.amount > 0)) return null;

    const runtimeEffect = getOrCompileSkSL(GRAIN_SKSL, ck);
    if (!runtimeEffect) return null;

    const seed = effect.animated ? effect.seed + Math.floor(time * 1000) : effect.seed;

    return runtimeEffect.makeShaderWithChildren(
        [
            origin[0], origin[1],
            effect.amount, Math.max(effect.size * scale, 1), seed, effect.colored ? 1 : 0,
        ],
        [content],
    );
}

/** Film grain. Works on the node's own content or on the backdrop beneath it. */
export const grainEffectHandler: EffectHandler<GrainEffect> = {
    type: "grain",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) =>
        makeGrainShader(effect, ck, content, geom.scale, geom.time, patternOrigin(effect, geom)),
};
