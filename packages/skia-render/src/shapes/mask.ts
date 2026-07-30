import type { CanvasKit, Canvas } from "@motion-script/canvaskit";
import { MaskApplyLayer, MaskMode, MaskOptions } from "@motion-script/core";
import type { BooleanHandler } from "./boolean";

interface MaskFrame {
    mode: MaskMode;
    inverted: boolean;
    // null = all layers active (default); Set = only listed layers are masked
    apply: Set<MaskApplyLayer> | null;
    restores: number;
}

/**
 * Implements the three mask modes by composing canvas save/clip/blend
 * primitives:
 *  - "vector": collect contributed paths into a union and `clipPath` directly
 *    (no layer — cheapest, but limited to geometric shapes).
 *  - "luminance": render the mask content through a luminance-to-alpha color
 *    filter into a layer, so pixel brightness drives opacity.
 *  - "alpha": render the mask content into a plain layer and blend the masked
 *    content against it with `SrcIn`/`SrcOut`.
 * `restores` records how many `canvas.restore()` calls `endMask` must issue
 * to unwind the saves made in `beginMask`/`applyMask`.
 */
export class MaskHandler {
    private maskStack: MaskFrame[] = [];

    constructor(
        private canvasKit: CanvasKit,
        private getCanvas: () => Canvas,
        private boolean: BooleanHandler,
    ) {}

    dispose(): void {
        this.maskStack = [];
    }

    beginMask(options?: MaskOptions): void {
        const canvas = this.getCanvas();
        const mode: MaskMode = options?.mode ?? "alpha";
        const inverted = options?.inverted ?? false;
        const raw = options?.apply;
        const apply = raw != null
            ? new Set(Array.isArray(raw) ? raw : [raw])
            : null;

        if (mode === "vector") {
            canvas.save();
            this.boolean.pushFrame();
            this.maskStack.push({ mode, inverted, apply, restores: 1 });
            return;
        }

        if (mode === "luminance") {
            canvas.saveLayer();
            const lumPaint = new this.canvasKit.Paint();
            const lumFilter = this.canvasKit.ColorFilter.MakeMatrix([
                0,      0,      0,      0, 0,
                0,      0,      0,      0, 0,
                0,      0,      0,      0, 0,
                0.2126, 0.7152, 0.0722, 0, 0,
            ]);
            lumPaint.setColorFilter(lumFilter);
            canvas.saveLayer(lumPaint);
            lumPaint.delete();
            this.maskStack.push({ mode, inverted, apply, restores: 2 });
            return;
        }

        // alpha
        canvas.saveLayer();
        this.maskStack.push({ mode, inverted, apply, restores: 2 });
    }

    // Returns the apply set for the innermost active mask, or null if no mask
    // is active / no apply restriction was set (= all layers pass through).
    getApply(): Set<MaskApplyLayer> | null {
        const top = this.maskStack[this.maskStack.length - 1];
        return top?.apply ?? null;
    }

    applyMask(onReset: () => void): void {
        const canvas = this.getCanvas();
        const top = this.maskStack[this.maskStack.length - 1];
        if (!top) {
            console.warn("applyMask() called outside of a mask scope.");
            return;
        }

        if (top.mode === "vector") {
            const paths = this.boolean.popFrame();
            const combined = this.boolean.combinePaths(paths, "union");
            onReset();
            if (combined) {
                const op = top.inverted
                    ? this.canvasKit.ClipOp.Difference
                    : this.canvasKit.ClipOp.Intersect;
                canvas.clipPath(combined, op, true);
                combined.delete();
            }
            return;
        }

        if (top.mode === "luminance") {
            canvas.restore();
        }

        const blendPaint = new this.canvasKit.Paint();
        blendPaint.setBlendMode(
            top.inverted
                ? this.canvasKit.BlendMode.SrcOut
                : this.canvasKit.BlendMode.SrcIn,
        );
        canvas.saveLayer(blendPaint);
        blendPaint.delete();

        onReset();
    }

    endMask(): void {
        const frame = this.maskStack.pop();
        if (!frame) return;
        const canvas = this.getCanvas();
        for (let i = 0; i < frame.restores; i++) {
            canvas.restore();
        }
    }
}
