import type { SolidFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";

/** Flat-color fill — sets paint color components directly, no shader. */
export class SolidFillRenderer extends FillRenderer<SolidFillResolved> {
    applyPaint(fill: SolidFillResolved, ctx: FillRendererContext): boolean {
        // setColorComponents takes scalars directly (defaults to sRGB), avoiding
        // the per-call Float32Array that Color4f()+setColor() allocates on the
        // wasm heap every frame for every shape.
        // setColorComponents writes the whole RGBA, overwriting the alpha the
        // handler set via setAlphaf — so fold the pass-through world alpha in
        // here, or the node/group opacity would be lost for solid fills.
        ctx.paint.setColorComponents(
            fill.color[0],
            fill.color[1],
            fill.color[2],
            fill.color[3] * (fill.opacity ?? 1) * ctx.worldAlpha,
        );
        ctx.paint.setShader(null);
        return true;
    }
}
