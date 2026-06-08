import { type SceneEffect as IEffect } from "@motion-script/core";
import type { CanvasKit } from "@motion-script/canvaskit";

/**
 * Abstract base for CanvasKit effect renderers.
 *
 * Subclasses implement `makeImageFilter` using either built-in CanvasKit filters
 * (ImageFilter.MakeBlur, ColorFilter.MakeMatrix, etc.) or custom SkSL shaders
 * via CanvasKit.RuntimeEffect.Make(sksl).
 *
 * The returned ImageFilter is applied as a saveLayer paint wrapping the node's
 * draw calls, so it composites the entire node before applying the filter.
 */
export abstract class CanvasKitEffect<T extends IEffect = IEffect> {
    readonly type: string;

    constructor(type: string) {
        this.type = type;
    }

    /**
     * Produce a Skia ImageFilter for this effect.
     *
     * @param effect  Effect data (radius, amount, etc.)
     * @param ck      Live CanvasKit instance
     * @param width   Surface width in pixels — needed for size-relative effects (e.g. pixelate)
     * @param height  Surface height in pixels
     * @returns       An ImageFilter object, or null if the effect cannot be applied
     */
    abstract makeImageFilter(effect: T, ck: CanvasKit, width: number, height: number): any;

    /**
     * Clean up any persistent CanvasKit objects (e.g. cached RuntimeEffect).
     * Called when the draw context is disposed.
     */
    dispose(): void { }
}
