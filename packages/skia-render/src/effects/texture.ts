import type { EffectGeometry, EffectHandler, EffectResources } from "./handler";
import type { CanvasKit, Shader } from "@motion-script/canvaskit";
import { getOrCompileSkSL } from "../sksl-cache";
import { type TextureEffect } from "@motion-script/core";

/**
 * Overlay a loaded image onto the content, blended.
 *
 * The blend is done in SkSL rather than by composing a Skia blend, because the
 * texture has to be *positioned* first — scaled, rotated and centred on the node
 * — and an ImageFilter blend has no way to place its foreground. One shader
 * samples the texture at the mapped coordinate and mixes it in.
 *
 * Only the separable blends worth using on a material are implemented; anything
 * else falls back to `multiply`, which is what a texture physically does — it
 * removes light where the surface is rough.
 */
const TEXTURE_SKSL = `
uniform shader u_content;  // snapshot of the source (premultiplied)
uniform shader u_texture;  // the overlay image
uniform vec2   u_center;   // node centre, device px
uniform vec2   u_half;     // node half-extent, device px
uniform vec2   u_texHalf;  // texture half-size, texture px
uniform float  u_scale;    // 1 = texture covers the node once
uniform float  u_cos;      // rotation, precomputed
uniform float  u_sin;
uniform float  u_amount;   // 0–1 blend strength
uniform float  u_blend;    // 0 multiply, 1 overlay, 2 screen, 3 softLight

float blendChannel(float base, float tex) {
    if (u_blend > 2.5) {
        // Soft light (Photoshop's formulation), the gentlest of the four.
        return tex < 0.5
            ? base - (1.0 - 2.0 * tex) * base * (1.0 - base)
            : base + (2.0 * tex - 1.0) * (sqrt(base) - base);
    }
    if (u_blend > 1.5) return 1.0 - (1.0 - base) * (1.0 - tex);   // screen
    if (u_blend > 0.5) {                                           // overlay
        return base < 0.5 ? 2.0 * base * tex : 1.0 - 2.0 * (1.0 - base) * (1.0 - tex);
    }
    return base * tex;                                             // multiply
}

vec4 main(vec2 fragCoord) {
    vec4 c = u_content.eval(fragCoord);
    if (c.a <= 0.0) return c;

    // Node-local, rotated, then mapped into the texture's own pixel space.
    vec2 d = fragCoord - u_center;
    vec2 r = vec2(d.x * u_cos - d.y * u_sin, d.x * u_sin + d.y * u_cos);
    vec2 uv = r / max(u_half, vec2(1.0)) * u_scale;         // -1..1 across the node
    vec2 texel = (uv * 0.5 + 0.5) * (u_texHalf * 2.0);

    vec4 t = u_texture.eval(texel);
    if (t.a <= 0.0) return c;                               // outside the texture
    vec3 tex = t.rgb / t.a;

    vec3 base = c.rgb / c.a;                                // un-premultiply
    vec3 blended = vec3(
        blendChannel(base.r, tex.r),
        blendChannel(base.g, tex.g),
        blendChannel(base.b, tex.b)
    );
    vec3 out_ = mix(base, blended, clamp(u_amount, 0.0, 1.0) * t.a);
    return vec4(out_ * c.a, c.a);                           // re-premultiply
}
`;

/** Blend selector — the four worth having on a material surface. */
const BLEND_ID: Record<string, number> = {
    multiply: 0,
    overlay: 1,
    screen: 2,
    "soft-light": 3,
    softLight: 3,
};

/**
 * Image-shader wrappers, keyed by src.
 *
 * The image itself belongs to the asset manager; what we own is the shader
 * wrapping it, and that has to outlive the `makeShader` call that binds it as a
 * child. Caching by src gives it a lifetime we control and frees it in
 * `dispose`, where creating one per draw would either leak or be freed out from
 * under the shader still using it.
 */
const wrappers = new Map<string, Shader>();

/**
 * Wrap the loaded image as a repeating child shader, or null if it isn't there.
 *
 * Repeat tiling rather than clamp: a texture scaled above 1 is meant to tile,
 * and clamping would smear its edge pixels across everything beyond the first
 * copy.
 */
function textureShader(effect: TextureEffect, ck: CanvasKit, res: EffectResources): Shader | null {
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
 * Texture overlay, on the node's own content or on the backdrop beneath it.
 */
export const textureEffectHandler: EffectHandler<TextureEffect> = {
    type: "texture",
    sampling: { tileMode: "decal", filterMode: "linear" },

    resources(effect, ck, res) {
        if (!(effect.amount > 0) || !effect.src) return null;
        const shader = textureShader(effect, ck, res);
        return shader ? [shader] : null;
    },

    makeShader(effect, ck, content, geom: EffectGeometry, extra) {
        const texture = extra?.[0];
        // No image — not loaded yet, or the path is wrong. Either way this frame
        // has no texture, so leave the content alone rather than flashing.
        if (!texture) return null;
        if (geom.width <= 0 || geom.height <= 0) return null;

        const runtimeEffect = getOrCompileSkSL(TEXTURE_SKSL, ck);
        if (!runtimeEffect) return null;

        const radians = (effect.angle * Math.PI) / 180;
        // The texture shader samples in the image's own pixel space, and the
        // node box is all the shader knows — map one node-width onto one
        // texture-width so `scale: 1` covers the node exactly, whatever the
        // image's pixel dimensions.
        const texHalfX = geom.width / 2;
        const texHalfY = geom.height / 2;

        return runtimeEffect.makeShaderWithChildren(
            [
                geom.centerX, geom.centerY,
                geom.width / 2, geom.height / 2,
                texHalfX, texHalfY,
                Math.max(effect.scale, 0.01),
                Math.cos(radians), Math.sin(radians),
                effect.amount,
                BLEND_ID[effect.blend] ?? 0,
            ],
            [content, texture],
        );
    },

    dispose() {
        for (const shader of wrappers.values()) shader.delete();
        wrappers.clear();
    },
};
