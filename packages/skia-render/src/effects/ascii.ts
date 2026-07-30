import type { EffectGeometry, EffectHandler, EffectResources } from "./handler";
import { getOrCompileSkSL } from "../sksl-cache";
import { resolveAsciiCharset, resolveEffectColor, type AsciiEffect } from "@motion-script/core";
import { GlyphAtlasCache, atlasCell, atlasGlyphCount } from "./glyph-atlas";

/** Atlas cells are baked at this multiple of the on-screen cell, capped in the baker. */
const ATLAS_OVERSAMPLE = 2;

/**
 * Cell resolution the atlas is baked at for an authored `size`.
 *
 * Baked above the on-screen size so glyphs stay crisp if the node is scaled up
 * after the atlas was first built — the alternative, re-baking per scale, would
 * defeat the point of caching it.
 */
const bakedCell = (size: number): number => atlasCell(Math.max(8, size * ATLAS_OVERSAMPLE));

/**
 * ASCII art: one texel read per cell, one glyph drawn in its place.
 *
 * Tone is sampled at the **cell centre**, not averaged over the cell. That is
 * both cheaper and more faithful — it is the same point-sampling a terminal does
 * when it decides what a character position contains, and averaging would blur
 * the very structure the grid is meant to expose.
 *
 * The glyph itself comes from `u_atlas`, a one-row texture of the charset baked
 * darkest-first. Indexing it by luminance and offsetting by the pixel's position
 * within its cell reproduces the glyph with no per-glyph work at draw time.
 *
 * Ink and background are composited in straight colour and premultiplied at the
 * end, so a transparent `background` genuinely lets the backdrop through instead
 * of compositing against black.
 */
const ASCII_SKSL = `
uniform shader u_content;    // snapshot of the source (premultiplied)
uniform shader u_atlas;      // charset baked darkest-first, one row of cells
uniform vec2   u_center;     // cell grid anchor, device px
uniform float  u_cell;       // cell size, device px
uniform float  u_count;      // glyphs in the atlas
uniform float  u_atlasCell;  // atlas cell edge, texture px
uniform vec4   u_ink;        // glyph colour, straight RGBA
uniform vec4   u_background; // colour behind the glyphs, straight RGBA
uniform float  u_colored;    // 1 = tint each glyph with its own cell's colour

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 main(vec2 fragCoord) {
    float cell = max(u_cell, 2.0);

    // Locate this pixel's cell, and where inside it the pixel sits (0–1).
    vec2 fromOrigin = fragCoord - u_center;
    vec2 index = floor(fromOrigin / cell);
    vec2 cellOrigin = u_center + index * cell;
    vec2 within = clamp((fragCoord - cellOrigin) / cell, 0.0, 1.0);

    vec4 src = u_content.eval(cellOrigin + cell * 0.5);
    if (src.a <= 0.0) return vec4(0.0);

    vec3 base = src.rgb / src.a;                    // un-premultiply
    float tone = clamp(dot(base, LUMA), 0.0, 1.0);

    // The ramp runs least-ink to most-ink, which is dark-to-light only while the
    // ink is brighter than what's behind it. Flip for a dark-on-light (paper)
    // scheme so a dark cell stays dark either way, and a custom ramp never has
    // to be written twice.
    float inkLum = dot(u_ink.rgb, LUMA);
    float bgLum = dot(u_background.rgb, LUMA);
    float ramp = inkLum >= bgLum ? tone : 1.0 - tone;

    float glyph = clamp(floor(ramp * u_count), 0.0, u_count - 1.0);
    vec2 atlasPos = vec2((glyph + within.x) * u_atlasCell, within.y * u_atlasCell);
    float coverage = clamp(u_atlas.eval(atlasPos).r, 0.0, 1.0);

    vec3 ink = u_colored > 0.5 ? base : u_ink.rgb;
    vec3 straight = mix(u_background.rgb, ink, coverage);
    float alpha = mix(u_background.a, u_ink.a, coverage) * src.a;

    return vec4(straight * alpha, alpha);           // re-premultiply
}
`;

/**
 * ASCII art over the node's own content, or over the backdrop beneath it.
 *
 * The first effect to use {@link EffectHandler.resources}: its glyph atlas is
 * baked once per charset/font/cell-size and cached here for the life of the draw
 * context, since baking text is far too expensive to repeat per frame.
 */
export const asciiEffectHandler: EffectHandler<AsciiEffect> = {
    type: "ascii",
    sampling: { tileMode: "decal", filterMode: "nearest" },

    resources(effect, ck, res: EffectResources) {
        const charset = resolveAsciiCharset(effect.charset);
        if (charset.length === 0) return null;

        const atlas = atlases.get(
            {
                charset,
                fontFamily: effect.fontFamily,
                fontWeight: 400,
                cell: bakedCell(effect.size),
            },
            ck,
            res,
        );
        return atlas ? [atlas.shader] : null;
    },

    makeShader(effect, ck, content, geom: EffectGeometry, extra) {
        const atlasShader = extra?.[0];
        // No atlas means the bake failed. Returning null leaves the content
        // untouched, which beats drawing a grid of blank cells.
        if (!atlasShader) return null;

        const cell = effect.size * geom.scale;
        if (!(cell >= 2)) return null;

        const runtimeEffect = getOrCompileSkSL(ASCII_SKSL, ck);
        if (!runtimeEffect) return null;

        const ink = resolveEffectColor(effect.ink);
        const background = resolveEffectColor(effect.background);

        return runtimeEffect.makeShaderWithChildren(
            [
                geom.centerX, geom.centerY,
                cell,
                // Derived from the same clamps the baker used, rather than read
                // back off the atlas — one source of truth, nothing to thread.
                atlasGlyphCount(resolveAsciiCharset(effect.charset)),
                bakedCell(effect.size),
                ...ink,
                ...background,
                effect.colored ? 1 : 0,
            ],
            [content, atlasShader],
        );
    },

    dispose() {
        atlases.dispose();
    },
};

/** Baked atlases, living for the draw context's lifetime. Freed in `dispose`. */
const atlases = new GlyphAtlasCache();
