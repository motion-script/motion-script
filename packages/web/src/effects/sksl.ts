import type { SkSLEffect } from "@motion-script/core";
import { getCanvasKitBlendMode } from "../blend";
import { getOrCompileSkSL } from "./sksl-cache";
import type { EffectHandler } from "./handler";

/** Uniform values, flattened to the single float array SkSL expects. */
const flatten = (effect: SkSLEffect): number[] =>
    effect.uniforms.flatMap((u) => (typeof u.value === "number" ? [u.value] : u.value));

/**
 * Custom SkSL, in both modes. `mode` picks the path, which is why one handler
 * covers both — they are the same authored effect:
 *
 * **foreground** (`makeImageFilter`) — the shader generates colour from
 * position/uniforms and is composed onto the node's layer via
 * `MakeBlend(blendMode, source, shaderFilter)`; `background = null` is the
 * layer's own content. Contract:
 * ```glsl
 * uniform float u_myParam;   // uniforms in declaration order
 * vec4 main(vec2 fragCoord) { return vec4(r, g, b, a); }
 * ```
 *
 * **backdrop** (`makeShader`) — the shader receives the content beneath the node
 * as its first child shader and resamples it. Contract:
 * ```glsl
 * uniform shader u_backdrop; // always the first child
 * vec4 main(vec2 fragCoord) { return u_backdrop.eval(somewhereElse); }
 * ```
 */
export const skslEffectHandler: EffectHandler<SkSLEffect> = {
    type: "sksl",
    sampling: { tileMode: "clamp", filterMode: "linear" },

    // Only the backdrop variant needs the snapshot-and-redraw scope; the
    // foreground variant composes as an ImageFilter below.
    handles: (effect, target) => target === "backdrop" && effect.mode === "backdrop",

    makeShader(effect, ck, content) {
        const rte = getOrCompileSkSL(effect.shader, ck);
        if (!rte) return null;
        // The first child shader is always u_backdrop.
        return rte.makeShaderWithChildren(flatten(effect), [content]);
    },

    makeImageFilter(effect, ck) {
        // Backdrop-mode SkSL goes through makeShader instead.
        if (effect.mode === "backdrop") return null;

        const rte = getOrCompileSkSL(effect.shader, ck);
        if (!rte) return null;

        const shader = rte.makeShader(flatten(effect));
        // makeShader returns null on a uniform-buffer mismatch (e.g. a uniform
        // declared in the SkSL but not supplied in `effect.uniforms`) — drop the
        // effect rather than crash on the .delete() below.
        if (!shader) return null;
        const shaderIF = ck.ImageFilter.MakeShader(shader);
        shader.delete();

        // Screen by default: the overlay adds to the layer rather than replacing it.
        const blendMode = getCanvasKitBlendMode(ck, effect.blendMode ?? "screen");

        // background = null → the layer source; foreground = the shader filter.
        const result = ck.ImageFilter.MakeBlend(blendMode, null, shaderIF);
        shaderIF.delete();
        return result;
    },
};
