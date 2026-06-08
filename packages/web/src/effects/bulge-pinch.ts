import type { CanvasKit, RuntimeEffect, Shader } from "@motion-script/canvaskit";
import { type BulgePinchEffect } from "@motion-script/core";

/**
 * Magnifier/pinch lens that *resamples the backdrop* — it reads the content
 * beneath the node (passed in as the `u_backdrop` child shader) at a remapped
 * position, so the area under the node is genuinely bulged or pinched, not just
 * nudged. This is the resample approach a magnifying glass uses.
 *
 * The lens fills the node's *bounding box* (not a circle): position is normalised
 * into the box as `n = (uv − centre) / halfExtent`, and the box metric
 * `q = max(|n.x|, |n.y|)` runs 0 at the centre → 1 at the box edge. So a wide
 * rect distorts across its whole width, a tall one across its height, etc. The
 * caller clips the draw to the node's exact silhouette, so rounded corners /
 * ellipses / polygons round or shape the lens to match.
 *
 * `u_reach` (0–1) sets how far from the centre the warp extends within the box;
 * beyond it the field eases to identity so there is no seam at the shape edge.
 * Inside, a spherical (barrel) profile drives the magnification:
 *
 *   t       = clamp((reach − q) / reach, 0, 1)   1 at centre → 0 at the reach edge
 *   z       = sqrt(1 − (1 − t)²)                 dome height; 1 at centre → 0 at edge
 *   factor  = 1 − strength · z                   strength>0 magnifies; <0 compresses
 *   sample  = centre + (uv − centre) · factor
 */
const BULGE_PINCH_SKSL = `
uniform shader u_backdrop;
uniform vec2  u_center;   // lens centre, device px
uniform vec2  u_half;     // node half-extent (halfWidth, halfHeight), device px
uniform float u_reach;    // 0–1 fraction of the box the warp spans
uniform float u_strength; // + bulge (magnify), − pinch (compress)

vec4 main(vec2 fragCoord) {
    vec2 n = (fragCoord - u_center) / max(u_half, vec2(1.0));
    float q = max(abs(n.x), abs(n.y)); // box metric: 0 centre → 1 box edge
    float reach = max(u_reach, 0.001);
    if (q >= reach) {
        return u_backdrop.eval(fragCoord);
    }
    float t = clamp((reach - q) / reach, 0.0, 1.0); // 1 centre → 0 at reach edge
    float e = 1.0 - t;
    float z = sqrt(max(0.0, 1.0 - e * e));          // dome falloff
    float factor = 1.0 - u_strength * z;
    vec2 samplePos = u_center + (fragCoord - u_center) * factor;
    return u_backdrop.eval(samplePos);
}
`;

let cachedEffect: RuntimeEffect | null = null;

function getRuntimeEffect(ck: CanvasKit): RuntimeEffect | null {
    if (!cachedEffect) cachedEffect = ck.RuntimeEffect.Make(BULGE_PINCH_SKSL);
    return cachedEffect;
}

/** Drop the cached RuntimeEffect (called when the draw context is disposed). */
export function disposeBulgePinch(): void {
    cachedEffect?.delete();
    cachedEffect = null;
}

/**
 * Build a paint shader that draws the backdrop bulged/pinched within the lens
 * disc and passes it through untouched elsewhere. The caller draws it over the
 * surface (clipped to the node silhouette), replacing the backdrop region with
 * the warped version. Returns null when the effect is a no-op.
 *
 * @param effect    bulge/pinch params (strength, radius=reach, centre).
 * @param ck        live CanvasKit instance.
 * @param backdrop  child shader wrapping the snapshot of the content beneath.
 * @param centerX   lens centre X in device px (node centre).
 * @param centerY   lens centre Y in device px.
 * @param width     node width in device px (the lens box width).
 * @param height    node height in device px (the lens box height).
 */
export function makeBulgePinchShader(
    effect: BulgePinchEffect,
    ck: CanvasKit,
    backdrop: Shader,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
): Shader | null {
    const strength = effect.strength;
    if (strength === 0 || effect.radius <= 0 || width <= 0 || height <= 0) return null;

    // center is a 0–1 offset from the node centre (0.5,0.5 = dead centre).
    const cx = centerX + (effect.center.x - 0.5) * width;
    const cy = centerY + (effect.center.y - 0.5) * height;
    const halfW = width / 2;
    const halfH = height / 2;
    // radius is a 0–1 reach: how far across the node box the warp spans.
    const reach = Math.min(1, effect.radius);

    const runtimeEffect = getRuntimeEffect(ck);
    if (!runtimeEffect) return null;

    return runtimeEffect.makeShaderWithChildren(
        [cx, cy, halfW, halfH, reach, strength],
        [backdrop],
    );
}
