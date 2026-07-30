import type { EffectGeometry, EffectHandler, EffectResources } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type DisplaceEffect } from "@motion-script/core";

/**
 * Displacement map — the source is resampled at a position pushed around by a
 * second image, rather than having its colours changed.
 *
 * Structurally this is `texture`'s shader with the last step inverted: the same
 * node-local → map-pixel mapping (scale, rotation, centring), but the sampled
 * value becomes an *offset applied to the content coordinate* instead of a
 * colour blended into the content. That is the whole difference between a
 * texture overlay and a warp.
 *
 * `u_midpoint` is what the map calls "no displacement": signed data packed into
 * unsigned bytes centres on 0.5, so subtracting it turns 0…1 into −0.5…0.5.
 * Doubling that gives a full −1…1 deflection at the extremes, which is what
 * makes `amount` read as "px at full deflection" rather than "px at white".
 *
 * A map pixel that is fully transparent contributes no displacement — an
 * unpainted region of the map should leave the content alone, not slam it to the
 * corner, which is what reading `t.rgb` unguarded would do.
 */
const DISPLACE_SKSL = `
uniform shader u_content;   // snapshot of the source (premultiplied)
uniform shader u_map;       // the displacement map
uniform vec2   u_center;    // node centre, device px
uniform vec2   u_half;      // node half-extent, device px
uniform vec2   u_amount;    // px displacement at full deflection, device px
uniform float  u_scale;     // 1 = map covers the node once
uniform float  u_cos;       // map rotation, precomputed
uniform float  u_sin;
uniform float  u_midpoint;  // map value meaning "don't move"
uniform float  u_channel;   // 0 rg, 1 luminance, 2 alpha

vec4 main(vec2 fragCoord) {
    // Node-local, rotated, then mapped into the map's own pixel space — the
    // same mapping the texture overlay uses, so a map and a texture authored
    // against the same node line up.
    vec2 d = fragCoord - u_center;
    vec2 r = vec2(d.x * u_cos - d.y * u_sin, d.x * u_sin + d.y * u_cos);
    vec2 uv = r / max(u_half, vec2(1.0)) * u_scale;
    vec2 texel = (uv * 0.5 + 0.5) * (u_half * 2.0);

    vec4 m = u_map.eval(texel);
    if (m.a <= 0.0) return u_content.eval(fragCoord);   // nothing here to push with

    vec3 mv = m.rgb / m.a;                              // un-premultiply
    vec2 signal;
    if (u_channel > 1.5) {
        signal = vec2(m.a);
    } else if (u_channel > 0.5) {
        signal = vec2(dot(mv, vec3(0.2126, 0.7152, 0.0722)));
    } else {
        signal = mv.rg;
    }

    vec2 offset = (signal - u_midpoint) * 2.0 * u_amount;
    return u_content.eval(fragCoord + offset);
}
`;

/** Channel selector — matches `DisplaceChannel`'s order. */
const CHANNEL_ID: Record<string, number> = { rg: 0, luminance: 1, alpha: 2 };

/**
 * Map-image shader wrappers, keyed by src.
 *
 * Same ownership rule as the texture effect: the image belongs to the asset
 * manager, but the shader wrapping it has to outlive the `makeShader` call that
 * binds it as a child, so it is cached here and freed in `dispose`.
 */
const wrappers = new Map<string, Shader>();

/** Wrap the loaded map as a repeating child shader, or null if it isn't there yet. */
function mapShader(effect: DisplaceEffect, ck: CanvasKit, res: EffectResources): Shader | null {
    const cached = wrappers.get(effect.src);
    if (cached) return cached;

    const image = res.getImage(effect.src);
    if (!image) return null;   // not loaded yet — try again next frame

    const shader = image.makeShaderOptions(
        ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Linear, ck.MipmapMode.None,
    );
    wrappers.set(effect.src, shader);
    return shader;
}

/**
 * Displacement map, on the node's own content or — the interesting case — on the
 * backdrop beneath it, where clipping to the node's silhouette turns it into
 * refraction.
 */
export const displaceEffectHandler: EffectHandler<DisplaceEffect> = {
    type: "displace",
    // Clamp rather than decal: a displaced sample that lands just outside should
    // smear the edge pixel, not punch a transparent hole in the content.
    sampling: { tileMode: "clamp", filterMode: "linear" },

    resources(effect, ck, res) {
        if (!effect.src) return null;
        if (effect.amount.x === 0 && effect.amount.y === 0) return null;
        const shader = mapShader(effect, ck, res);
        return shader ? [shader] : null;
    },

    makeShader(effect, ck, content, geom: EffectGeometry, extra) {
        const map = extra?.[0];
        // No map — not loaded yet, or the path is wrong. Either way this frame
        // has nothing to displace by, so leave the content alone rather than
        // flashing an un-warped frame in the middle of a warp.
        if (!map) return null;
        if (geom.width <= 0 || geom.height <= 0) return null;

        const runtimeEffect = getOrCompileSkSL(DISPLACE_SKSL, ck);
        if (!runtimeEffect) return null;

        const radians = (effect.angle * Math.PI) / 180;

        return runtimeEffect.makeShaderWithChildren(
            [
                geom.centerX, geom.centerY,
                geom.width / 2, geom.height / 2,
                // px options are authored in logical space; the shader runs in
                // device space, so scale like every other px-valued uniform.
                effect.amount.x * geom.scale, effect.amount.y * geom.scale,
                Math.max(effect.scale, 0.01),
                Math.cos(radians), Math.sin(radians),
                effect.midpoint,
                CHANNEL_ID[effect.channel] ?? 0,
            ],
            [content, map],
        );
    },

    dispose() {
        for (const shader of wrappers.values()) shader.delete();
        wrappers.clear();
    },
};
