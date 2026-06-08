import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

/** A single uniform value: a float or a flat array for vec2/vec3/vec4. */
export type SkSLUniformValue = number | number[];

export interface SkSLUniform {
    name: string;
    value: SkSLUniformValue;
}

/**
 * Custom SkSL effect. Two modes:
 *
 * - `'backdrop'`: The shader receives `uniform shader u_backdrop` (a snapshot of the
 *   canvas content beneath the node). Use this for magnification, distortion, ripple, etc.
 *   Works identically to the built-in zoom/bulge effects — the result replaces the backdrop
 *   within the node's silhouette clip.
 *
 * - `'layer'`: The shader is applied as an overlay/modifier on the node's own layer via
 *   `ImageFilter.MakeShader`. The shader generates a colour from uniforms/position and is
 *   Screen-blended onto the layer. Useful for procedural overlays (noise, gradients, glows).
 *   Use `blendMode` to change how the shader composites onto the layer content.
 */
export interface SkSLEffect {
    type: "sksl";
    /** SkSL shader source code. */
    shader: string;
    /** Uniform values passed to the shader in declaration order. Values lerp component-wise. */
    uniforms: SkSLUniform[];
    /** How the effect is applied. */
    mode: "layer" | "backdrop";
    /**
     * Blend mode used when `mode === 'layer'`. Defaults to `'screen'` so the
     * generated shader overlay composites additively onto the layer.
     *
     * Any CSS blend-mode name that CanvasKit supports is valid
     * (e.g. `'srcOver'`, `'multiply'`, `'screen'`, `'overlay'`).
     */
    blendMode?: string;
}

function lerpUniformValue(a: SkSLUniformValue, b: SkSLUniformValue, t: number): SkSLUniformValue {
    if (typeof a === "number" && typeof b === "number") return lerpNumber(a, b, t);
    if (Array.isArray(a) && Array.isArray(b)) {
        const len = Math.max(a.length, b.length);
        return Array.from({ length: len }, (_, i) => lerpNumber(a[i] ?? 0, b[i] ?? 0, t));
    }
    return t < 0.5 ? a : b;
}

function uniformsEqual(a: SkSLUniform[], b: SkSLUniform[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].name !== b[i].name) return false;
        const av = a[i].value, bv = b[i].value;
        if (typeof av === "number" && typeof bv === "number") {
            if (av !== bv) return false;
        } else if (Array.isArray(av) && Array.isArray(bv)) {
            if (av.length !== bv.length || av.some((v, j) => v !== bv[j])) return false;
        } else {
            return false;
        }
    }
    return true;
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
};
