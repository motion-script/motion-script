import type { CanvasKit, RuntimeEffect, Shader } from "@motion-script/canvaskit";
import { type BulgeEffect } from "@motion-script/core";

/**
 * Barrel / pincushion lens applied to the node's *own* content — the `u_content`
 * child shader wraps a snapshot of everything the node painted (fill, stroke and
 * children). It is the optical-distortion model from a WebGL lens shader ported
 * to SkSL: positions are normalised into the node box, a polynomial radial term
 * remaps them, and the content is resampled at the remapped position.
 *
 *   p        = (fragCoord − centre) / half      // box-normalised, −1…1 per axis
 *   r        = length(p)                         // radial distance in box space
 *   k        = strength>0 ? strength·2 : strength·0.8
 *   scale    = 1 + k
 *   sample   = centre + p·(1 + k·r²)/scale · half
 *
 * With this profile the corners (r at its max) map close to themselves so the
 * edges stay pinned, while the centre magnifies (k>0, barrel/bulge) or compresses
 * (k<0, pincushion/pinch). Samples that fall outside the node box read transparent
 * (Decal tiling on the content snapshot), so the warp never drags in the backdrop.
 */
const BULGE_SKSL = `
uniform shader u_content;  // snapshot of the node's own content
uniform vec2  u_center;    // node centre, device px
uniform vec2  u_half;      // node half-extent (halfWidth, halfHeight), device px
uniform float u_strength;  // + bulge (barrel), − pinch (pincushion)

vec4 main(vec2 fragCoord) {
    vec2 p = (fragCoord - u_center) / max(u_half, vec2(1.0));
    float r = length(p);
    float k = u_strength > 0.0 ? u_strength * 2.0 : u_strength * 0.8;
    float scale = 1.0 + k;
    vec2 distorted = p * (1.0 + k * r * r) / scale;
    vec2 samplePos = u_center + distorted * u_half;
    return u_content.eval(samplePos);
}
`;

let cachedEffect: RuntimeEffect | null = null;

function getRuntimeEffect(ck: CanvasKit): RuntimeEffect | null {
    if (!cachedEffect) cachedEffect = ck.RuntimeEffect.Make(BULGE_SKSL);
    return cachedEffect;
}

/** Drop the cached RuntimeEffect (called when the draw context is disposed). */
export function disposeBulge(): void {
    cachedEffect?.delete();
    cachedEffect = null;
}

/**
 * Build a paint shader that draws the node's content barrel/pincushion-distorted
 * within its bounding box. The caller draws it over the surface in device space;
 * the content snapshot's own alpha (Decal tiling) bounds it to the node. Returns
 * null when the effect is a no-op.
 *
 * @param effect    bulge params (strength).
 * @param ck        live CanvasKit instance.
 * @param content   child shader wrapping the snapshot of the node's own content.
 * @param centerX   node centre X in device px.
 * @param centerY   node centre Y in device px.
 * @param width     node width in device px (the lens box width).
 * @param height    node height in device px (the lens box height).
 */
export function makeBulgeShader(
    effect: BulgeEffect,
    ck: CanvasKit,
    content: Shader,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
): Shader | null {
    const strength = effect.strength;
    if (strength === 0 || width <= 0 || height <= 0) return null;

    const halfW = width / 2;
    const halfH = height / 2;

    const runtimeEffect = getRuntimeEffect(ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [centerX, centerY, halfW, halfH, strength],
        [content],
    );
}
