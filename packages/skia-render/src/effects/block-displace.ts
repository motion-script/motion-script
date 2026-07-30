import type { EffectGeometry, EffectHandler } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { resolveEffectAxis, type BlockDisplaceEffect } from "@motion-script/core";

/**
 * Datamosh-style tearing: cut the content into bands and slide each one by a
 * random amount.
 *
 * Two hashes per band, not one. The first decides *whether* the band moves at
 * all (against `density`) and the second decides *how far* — because a single
 * hash thresholded for both would correlate the two, so the bands that moved
 * would always be the ones that moved furthest. Independent draws are what make
 * a low density read as occasional big tears rather than a uniform shimmer.
 *
 * The band index is quantised from the axis-aligned distance to the node
 * centre, so the tear pattern travels with the node.
 */
const BLOCK_DISPLACE_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform vec2   u_center;   // band origin, device px
uniform float  u_amount;   // max displacement, device px
uniform float  u_size;     // band thickness, device px
uniform float  u_density;  // 0–1 share of bands that move
uniform float  u_seed;     // field offset
uniform vec2   u_axis;     // per-axis slide weight

float hash(float band, float salt) {
    return fract(sin(band * 78.233 + salt + u_seed * 13.7) * 43758.5453);
}

vec4 main(vec2 fragCoord) {
    vec2 d = fragCoord - u_center;

    // Bands are cut across the slide direction: an x-slide tears horizontal rows.
    float across = u_axis.x >= u_axis.y ? d.y : d.x;
    float band = floor(across / max(u_size, 1.0));

    float moves = step(1.0 - clamp(u_density, 0.0, 1.0), hash(band, 0.0));
    float shift = (hash(band, 37.0) * 2.0 - 1.0) * u_amount * moves;

    return u_content.eval(fragCoord - u_axis * shift);
}
`;

/**
 * Build the paint shader that draws the source torn into displaced bands.
 * Returns null when nothing can move (no amount, or no bands selected).
 */
export function makeBlockDisplaceShader(
    effect: BlockDisplaceEffect,
    ck: CanvasKit,
    content: Shader,
    geom: EffectGeometry,
): Shader | null {
    if (!(effect.amount > 0) || !(effect.density > 0)) return null;

    const runtimeEffect = getOrCompileSkSL(BLOCK_DISPLACE_SKSL, ck);
    if (!runtimeEffect) return null;

    const axis = resolveEffectAxis(effect.axis);
    if (axis.x === 0 && axis.y === 0) return null;

    return runtimeEffect.makeShaderWithChildren(
        [
            geom.centerX, geom.centerY,
            effect.amount * geom.scale,
            Math.max(effect.size * geom.scale, 1),
            effect.density,
            effect.seed,
            axis.x, axis.y,
        ],
        [content],
    );
}

/** Band tearing, on the node's own content or on the backdrop beneath it. */
export const blockDisplaceEffectHandler: EffectHandler<BlockDisplaceEffect> = {
    type: "blockDisplace",
    sampling: { tileMode: "decal", filterMode: "nearest" },
    makeShader: (effect, ck, content, geom) => makeBlockDisplaceShader(effect, ck, content, geom),
};
