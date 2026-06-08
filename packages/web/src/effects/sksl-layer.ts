import type { CanvasKit } from "@motion-script/canvaskit";
import type { SkSLEffect } from "@motion-script/core";
import { CanvasKitEffect } from "./effect";
import { getOrCompileSkSL } from "./sksl-cache";

/**
 * Layer-mode custom SkSL effect.
 *
 * The shader generates colour from position/uniforms and is composed onto the
 * node's layer via `ImageFilter.MakeBlend(blendMode, source, shaderFilter)`.
 *
 * - `background = null` → the node's layer content (dynamic source)
 * - `foreground = MakeShader(compiledShader)` → the shader output
 *
 * The default blend mode is Screen, which adds the shader output to the layer
 * additively. Use `effect.blendMode` to override (e.g. `'multiply'`, `'srcOver'`).
 *
 * SkSL contract for layer-mode shaders:
 * ```glsl
 * uniform float u_myParam;  // uniforms in declaration order
 *
 * vec4 main(vec2 fragCoord) {
 *   // generate overlay colour from position / uniforms
 *   return vec4(r, g, b, a);
 * }
 * ```
 */
export class SkSLLayerEffect extends CanvasKitEffect<SkSLEffect> {
    constructor() {
        super("sksl");
    }

    makeImageFilter(effect: SkSLEffect, ck: CanvasKit): any {
        // Backdrop-mode SkSL is handled by beginBackdropSkSL in the render context.
        if (effect.mode !== "layer") return null;

        const rte = getOrCompileSkSL(effect.shader, ck);
        if (!rte) return null;

        const flat = effect.uniforms.flatMap((u) =>
            typeof u.value === "number" ? [u.value] : u.value
        );

        const shader = rte.makeShader(flat);
        const shaderIF = ck.ImageFilter.MakeShader(shader);
        shader.delete();

        const blendModeName = effect.blendMode ?? "screen";
        const blendMode = resolveBlendMode(ck, blendModeName);

        // Blend the shader output onto the layer source.
        // background = null → source; foreground = shader filter
        const result = ck.ImageFilter.MakeBlend(blendMode, null, shaderIF);
        shaderIF.delete();
        return result;
    }
}

function resolveBlendMode(ck: CanvasKit, name: string): any {
    const map: Record<string, any> = {
        srcOver: ck.BlendMode.SrcOver,
        src: ck.BlendMode.Src,
        dst: ck.BlendMode.Dst,
        dstOver: ck.BlendMode.DstOver,
        srcIn: ck.BlendMode.SrcIn,
        dstIn: ck.BlendMode.DstIn,
        srcOut: ck.BlendMode.SrcOut,
        dstOut: ck.BlendMode.DstOut,
        srcATop: ck.BlendMode.SrcATop,
        dstATop: ck.BlendMode.DstATop,
        xor: ck.BlendMode.Xor,
        plus: ck.BlendMode.Plus,
        modulate: ck.BlendMode.Modulate,
        screen: ck.BlendMode.Screen,
        overlay: ck.BlendMode.Overlay,
        darken: ck.BlendMode.Darken,
        lighten: ck.BlendMode.Lighten,
        colorDodge: ck.BlendMode.ColorDodge,
        colorBurn: ck.BlendMode.ColorBurn,
        hardLight: ck.BlendMode.HardLight,
        softLight: ck.BlendMode.SoftLight,
        difference: ck.BlendMode.Difference,
        exclusion: ck.BlendMode.Exclusion,
        multiply: ck.BlendMode.Multiply,
        hue: ck.BlendMode.Hue,
        saturation: ck.BlendMode.Saturation,
        color: ck.BlendMode.Color,
        luminosity: ck.BlendMode.Luminosity,
    };
    return map[name] ?? ck.BlendMode.Screen;
}
