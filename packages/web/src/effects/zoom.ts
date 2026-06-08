import type { CanvasKit, RuntimeEffect, Shader } from "@motion-script/canvaskit";
import { type ZoomEffect } from "@motion-script/core";

/**
 * Magnifier lens that *resamples the backdrop* — it reads the content beneath
 * the node (passed in as the `u_backdrop` child shader) at a position scaled
 * toward `u_center`, so the area under the node is genuinely magnified, like a
 * magnifying glass. Unlike bulge/pinch there is no dome falloff: the whole lens
 * box magnifies uniformly by `u_scale`.
 *
 * The lens fills the node's *bounding box*; the caller clips the draw to the
 * node's exact silhouette, so an ellipse magnifies as an ellipse, a rounded rect
 * as a rounded rect, etc.
 *
 * To magnify by `s`, the backdrop is sampled at a point pulled `1/s` of the way
 * from the centre — so a 2× zoom reads from half the distance, doubling apparent
 * size:
 *
 *   sample = centre + (fragCoord − centre) / scale
 */
const ZOOM_SKSL = `
uniform shader u_backdrop;
uniform vec2  u_center; // lens centre, device px
uniform float u_scale;  // magnification factor (1 = none, 2 = 2x)

vec4 main(vec2 fragCoord) {
    vec2 samplePos = u_center + (fragCoord - u_center) / max(u_scale, 0.001);
    return u_backdrop.eval(samplePos);
}
`;

let cachedEffect: RuntimeEffect | null = null;

function getRuntimeEffect(ck: CanvasKit): RuntimeEffect | null {
    if (!cachedEffect) cachedEffect = ck.RuntimeEffect.Make(ZOOM_SKSL);
    return cachedEffect;
}

/** Drop the cached RuntimeEffect (called when the draw context is disposed). */
export function disposeZoom(): void {
    cachedEffect?.delete();
    cachedEffect = null;
}

/**
 * Build a paint shader that draws the backdrop magnified within the lens box and
 * passes it through untouched elsewhere. The caller draws it over the surface
 * (clipped to the node silhouette), replacing the backdrop region with the
 * zoomed version. Returns null when the effect is a no-op.
 *
 * @param effect    zoom params (scale, centre).
 * @param ck        live CanvasKit instance.
 * @param backdrop  child shader wrapping the snapshot of the content beneath.
 * @param centerX   lens centre X in device px (node centre).
 * @param centerY   lens centre Y in device px.
 * @param width     node width in device px (the lens box width).
 * @param height    node height in device px (the lens box height).
 */
export function makeZoomShader(
    effect: ZoomEffect,
    ck: CanvasKit,
    backdrop: Shader,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
): Shader | null {
    const scale = effect.scale;
    if (scale === 1 || scale <= 0 || width <= 0 || height <= 0) return null;

    // center is a 0–1 offset from the node centre (0.5,0.5 = dead centre).
    const cx = centerX + (effect.center.x - 0.5) * width;
    const cy = centerY + (effect.center.y - 0.5) * height;

    const runtimeEffect = getRuntimeEffect(ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [cx, cy, scale],
        [backdrop],
    );
}
