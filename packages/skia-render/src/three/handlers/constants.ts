/**
 * Translation between core's string-literal enums and three's numeric constants.
 *
 * Core describes 3D with plain strings (`side: "double"`, `blending: "additive"`)
 * precisely so it never has to name three. This module is the one place that
 * mapping lives, so adding a variant means touching core's union and this file —
 * nothing else.
 *
 * Every lookup falls back to a sensible default rather than throwing: a
 * descriptor from a newer core than this backend should render imperfectly, not
 * crash the frame.
 */

import type * as THREE from "three";
import type {
    Blend3D, Color, Faces3D, ShadowSettings3D,
    TextureColorSpace3D, TextureFilter3D, TextureWrap3D, ToneMapping3D,
} from "@motion-script/core";
import { parseColor } from "@motion-script/core";
import type { ThreeModule } from "../bridge";

/** Degrees (core's convention everywhere) → radians (three's). */
export function deg(value: number): number {
    return value * (Math.PI / 180);
}

export function faces(three: ThreeModule, value: Faces3D | undefined): THREE.Side {
    switch (value) {
        case "back": return three.BackSide;
        case "both": return three.DoubleSide;
        default: return three.FrontSide;
    }
}

export function blending(three: ThreeModule, value: Blend3D | undefined): THREE.Blending {
    switch (value) {
        case "additive": return three.AdditiveBlending;
        case "subtractive": return three.SubtractiveBlending;
        case "multiply": return three.MultiplyBlending;
        case "none": return three.NoBlending;
        default: return three.NormalBlending;
    }
}

export function wrap(three: ThreeModule, value: TextureWrap3D | undefined): THREE.Wrapping {
    switch (value) {
        case "repeat": return three.RepeatWrapping;
        case "mirror": return three.MirroredRepeatWrapping;
        default: return three.ClampToEdgeWrapping;
    }
}

export function magFilter(three: ThreeModule, value: TextureFilter3D | undefined): THREE.MagnificationTextureFilter {
    return value === "nearest" ? three.NearestFilter : three.LinearFilter;
}

export function minFilter(three: ThreeModule, value: TextureFilter3D | undefined): THREE.MinificationTextureFilter {
    // Mipmapped by default: a texture minified without mipmaps aliases badly at
    // distance, which is the common case for a 3D surface.
    return value === "nearest" ? three.NearestFilter : three.LinearMipmapLinearFilter;
}

export function colorSpace(three: ThreeModule, value: TextureColorSpace3D | undefined): THREE.ColorSpace {
    return value === "linear" ? three.LinearSRGBColorSpace : three.SRGBColorSpace;
}

/**
 * Shadow filter and map resolution, from one `quality`.
 *
 * three exposes these as two unrelated settings (`shadowMap.type` and a per-light
 * `mapSize`), and they are chosen together in practice — a soft filter over a
 * 512² map is mush, a hard filter over a 4096² one is still hard. Neither is a
 * design decision, so both come off the one word.
 */
export function shadowQuality(
    three: ThreeModule,
    value: ShadowSettings3D["quality"],
): { type: THREE.ShadowMapType; mapSize: number } {
    switch (value) {
        case "low": return { type: three.PCFShadowMap, mapSize: 512 };
        case "high": return { type: three.PCFSoftShadowMap, mapSize: 4096 };
        default: return { type: three.PCFSoftShadowMap, mapSize: 2048 };
    }
}

export function toneMapping(three: ThreeModule, value: ToneMapping3D | undefined): THREE.ToneMapping {
    switch (value) {
        case "none": return three.NoToneMapping;
        case "linear": return three.LinearToneMapping;
        case "reinhard": return three.ReinhardToneMapping;
        case "cineon": return three.CineonToneMapping;
        case "agx": return three.AgXToneMapping;
        case "neutral": return three.NeutralToneMapping;
        // Filmic default: it rolls highlights off gracefully where "none" clips.
        default: return three.ACESFilmicToneMapping;
    }
}

/**
 * Write a core {@link Color} into a `THREE.Color`.
 *
 * Core's `parseColor` returns **gamma-encoded sRGB** normalised to 0–1 (hex is
 * literally `byte / 255`), *not* linear-light — so this declares `SRGBColorSpace`
 * and lets three decode into its linear working space. Declaring it linear
 * instead skips that decode and renders everything conspicuously washed out.
 *
 * Going through core's parser rather than handing three the raw CSS string is
 * what makes every colour syntax core supports work in 3D for free: `oklch()`,
 * `lab()`, theme tokens, and the `"white/10"` opacity suffix.
 *
 * Returns the alpha channel separately, since three keeps opacity on the material
 * rather than in the colour.
 */
export function writeColor(three: ThreeModule, target: THREE.Color, value: Color): number {
    const [r, g, b, a] = typeof value === "string" ? parseColor(value) : value;
    target.setRGB(r, g, b, three.SRGBColorSpace);
    return a;
}

/** A fresh `THREE.Color` from a core {@link Color}. */
export function makeColor(three: ThreeModule, value: Color): THREE.Color {
    const color = new three.Color();
    writeColor(three, color, value);
    return color;
}

/** The alpha channel of a core {@link Color}, for folding into material opacity. */
export function colorAlpha(value: Color): number {
    const [, , , a] = typeof value === "string" ? parseColor(value) : value;
    return a;
}
