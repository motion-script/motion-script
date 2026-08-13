import type { BlendMode } from "../../fill/blend";
import type { ModedEffect, EffectData } from "../effect-data";
import {
    lerpUniformValue,
    uniformValuesEqual,
    type SkSLUniform,
    type SkSLUniformValue,
} from "../../sksl-uniforms";

// The uniform vocabulary is shared with the `shader` fill, which marshals the
// same values by name instead of by position. Re-exported here so the specifier
// consumers already use keeps resolving.
export type { SkSLUniform, SkSLUniformValue };

/**
 * Custom SkSL effect, classified by the shared {@link EffectMode}:
 *
 * - `'backdrop'`: The shader receives `uniform shader u_backdrop` (a snapshot of the
 *   canvas content beneath the node). Use this for magnification, distortion, ripple, etc.
 *   Works identically to the built-in magnify/bulge effects — the result replaces the backdrop
 *   within the node's silhouette clip.
 *
 * - `'foreground'` (the default): The shader is applied as an overlay/modifier on the node's
 *   own layer via `ImageFilter.MakeShader`. The shader generates a colour from uniforms/position
 *   and is composited onto the layer using {@link blendMode} (default Screen). Useful for
 *   procedural overlays (noise, gradients, glows).
 */
export interface SkSLEffect extends ModedEffect {
    type: "sksl";
    /** SkSL shader source code. */
    shader: string;
    /** Uniform values passed to the shader in declaration order. Values lerp component-wise. */
    uniforms: SkSLUniform[];
    /**
     * Blend mode used when `mode` is `'foreground'`. Defaults to `'screen'` so the
     * generated shader overlay composites additively onto the layer. Ignored for
     * `'backdrop'`, where the shader's output replaces the backdrop.
     */
    blendMode?: BlendMode;
}

// Positional, unlike the `shader` fill's record: an effect's uniforms are bound
// by declaration order, so a pair that agrees on values but not on order is a
// different binding and must compare unequal.
function uniformsEqual(a: SkSLUniform[], b: SkSLUniform[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((u, i) => u.name === b[i].name && uniformValuesEqual(u.value, b[i].value));
}

export const skslEffect: EffectData<SkSLEffect> = {
    lerp: (from, to, t) => ({
        type: "sksl",
        shader: from.shader,
        mode: from.mode,
        blendMode: from.blendMode,
        uniforms: from.uniforms.map((u, i) => ({
            name: u.name,
            value: lerpUniformValue(u.value, to.uniforms[i]?.value ?? u.value, t),
        })),
    }),
    equals: (a, b) =>
        a.shader === b.shader &&
        a.mode === b.mode &&
        a.blendMode === b.blendMode &&
        uniformsEqual(a.uniforms, b.uniforms),
    // A backdrop shader resamples `u_backdrop`, so it needs a redraw scope; the
    // foreground variant is an overlay composed via ImageFilter.MakeShader.
    surface: (effect) => (effect.mode === "backdrop" ? "shader" : "filter"),
};
