import type { CanvasKit, Canvas, Paint, Path as CKPath } from "@motion-script/canvaskit";
import { BooleanOperation } from "@motion-script/core";
import type { CurrentShape } from "./shape-handler";

interface PathCollectionFrame {
    paths: CKPath[];
    invBaseMatrix: number[];
}

/**
 * Combines paths via CanvasKit `PathOp`s and tracks nested "path collection"
 * frames. A frame records each contributed path transformed into the
 * coordinate space active when the frame began (via the inverse of that base
 * matrix), so paths drawn under different transforms still combine correctly
 * in one space — used for both explicit boolean ops and vector masks.
 */
export class BooleanHandler {
    private pathCollectionStack: PathCollectionFrame[] = [];
    private booleanOpStack: BooleanOperation[] = [];

    constructor(
        private canvasKit: CanvasKit,
        private getCanvas: () => Canvas,
    ) {}

    dispose(): void {
        this.pathCollectionStack = [];
        this.booleanOpStack = [];
    }

    isCollecting(): boolean {
        return this.pathCollectionStack.length > 0;
    }

    contributeToPathCollection(path: CKPath): void {
        if (this.pathCollectionStack.length === 0) return;
        const frame = this.pathCollectionStack[this.pathCollectionStack.length - 1];
        const current = this.getCanvas().getTotalMatrix();
        const rel = this.canvasKit.Matrix.multiply(frame.invBaseMatrix, current);
        const builder = new this.canvasKit.PathBuilder();
        builder.addPath(path, rel);
        frame.paths.push(builder.detachAndDelete());
    }

    pushFrame(): void {
        const m = Array.from(this.getCanvas().getTotalMatrix());
        const inv = this.canvasKit.Matrix.invert(m) ?? this.canvasKit.Matrix.identity();
        this.pathCollectionStack.push({ paths: [], invBaseMatrix: inv });
    }

    popFrame(): CKPath[] {
        const frame = this.pathCollectionStack.pop();
        return frame ? frame.paths : [];
    }

    private toCanvasKitPathOp(op: BooleanOperation): any {
        switch (op) {
            case "subtract":  return this.canvasKit.PathOp.Difference;
            case "intersect": return this.canvasKit.PathOp.Intersect;
            case "exclude":   return this.canvasKit.PathOp.XOR;
            case "union":
            default:          return this.canvasKit.PathOp.Union;
        }
    }

    /** Folds `paths` left-to-right with `op`, deleting inputs as it consumes them. Caller owns the result. */
    combinePaths(paths: CKPath[], op: BooleanOperation): CKPath | null {
        if (paths.length === 0) return null;
        const ckOp = this.toCanvasKitPathOp(op);
        let combined = paths[0];
        for (let i = 1; i < paths.length; i++) {
            const next = this.canvasKit.Path.MakeFromOp(combined, paths[i], ckOp);
            combined.delete();
            paths[i].delete();
            if (!next) {
                for (let j = i + 1; j < paths.length; j++) paths[j].delete();
                return null;
            }
            combined = next;
        }
        return combined;
    }

    beginBoolean(op: BooleanOperation): void {
        this.pushFrame();
        this.booleanOpStack.push(op);
    }

    endBoolean(
        getCanvas: () => Canvas,
    ): CurrentShape | null {
        const op = this.booleanOpStack.pop() ?? "union";
        const paths = this.popFrame();
        const combined = this.combinePaths(paths, op);
        if (!combined) return null;

        this.contributeToPathCollection(combined);

        const canvas = getCanvas();
        const shape: CurrentShape = {
            draw: (paint: Paint) => { canvas.drawPath(combined, paint); },
            ckPath: combined,
        };
        return shape;
    }
}
