import type { ImageFillResolved, MediaFilter } from "@motion-script/core";
import type { Image as CKImage } from "@motion-script/canvaskit";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { type ShapeBounds } from "./handler";
import { ImageFillFilterRegistry } from "./filters/registry";

/** Shades with the adapter-decoded image and applies the fill's filter chain. */
export class ImageFillRenderer extends FillRenderer<ImageFillResolved> {
    applyPaint(fill: ImageFillResolved, ctx: FillRendererContext): boolean {
        if (!fill.src) return false;
        const img = ctx.assets.getCKImage(fill.src);
        if (!img) return false;
        // Adapter-owned CKImage — do NOT push to transientImages (which gets
        // .delete()'d after the draw). The adapter releases the texture when
        // the underlying pixels are evicted.
        ctx.paint.setShader(makeImageShader(img, fill, ctx.canvasKit, ctx.getShapeBounds()));
        applyMediaFilters(fill, ctx);
        return true;
    }
}

/**
 * Apply the fill's filter chain to the paint's image filter slot. Filters are
 * composed in array order (first filter is innermost). Callers (FillHandler)
 * are responsible for clearing the image filter after drawing.
 */
export function applyMediaFilters(fill: { filters?: MediaFilter[] }, ctx: FillRendererContext): void {
    if (!fill.filters || fill.filters.length === 0) {
        ctx.paint.setImageFilter(null);
        return;
    }
    const composed = ImageFillFilterRegistry.compose(fill.filters, ctx.canvasKit);
    ctx.paint.setImageFilter(composed);
}

/**
 * Compute the image→canvas transform (3×3 matrix as a 9-tuple, row-major)
 * for a given fill descriptor and the destination bounds. This is exactly the
 * same matrix used by the image shader, so contour paths transformed by it
 * land on the visible image's pixel positions.
 */
export function computeImageMatrix(
    imgW: number,
    imgH: number,
    fill: { mode?: string; transform?: Float32Array | number[][]; scaling?: number },
    bounds: ShapeBounds | null,
): number[] {
    if (fill.transform) {
        if (fill.transform instanceof Float32Array) return Array.from(fill.transform);
        return (fill.transform as number[][]).flat();
    }
    if (bounds) {
        const mode = fill.mode ?? "fit";
        const shapeW = bounds.right - bounds.left;
        const shapeH = bounds.bottom - bounds.top;
        let sx: number, sy: number, tx: number, ty: number;
        if (mode === "fit") {
            const scale = Math.min(shapeW / imgW, shapeH / imgH);
            sx = scale; sy = scale;
            tx = bounds.left + (shapeW - imgW * scale) / 2;
            ty = bounds.top + (shapeH - imgH * scale) / 2;
        } else if (mode === "crop") {
            const scale = Math.max(shapeW / imgW, shapeH / imgH);
            sx = scale; sy = scale;
            tx = bounds.left + (shapeW - imgW * scale) / 2;
            ty = bounds.top + (shapeH - imgH * scale) / 2;
        } else if (mode === "tile") {
            sx = (fill as any).scaling ?? 1; sy = (fill as any).scaling ?? 1;
            tx = bounds.left; ty = bounds.top;
        } else {
            sx = shapeW / imgW; sy = shapeH / imgH;
            tx = bounds.left; ty = bounds.top;
        }
        return [sx, 0, tx, 0, sy, ty, 0, 0, 1];
    }
    const s = (fill as any).scaling ?? 1;
    return [s, 0, 0, 0, s, 0, 0, 0, 1];
}

/** Shared image-shader builder used by both image and video renderers. */
export function makeImageShader(
    img: CKImage,
    fill: { mode?: string; transform?: Float32Array | number[][]; scaling?: number },
    ck: any,
    bounds: ShapeBounds | null,
): any {
    const mode = fill.mode ?? "fit";
    const tileMode = mode === "tile"
        ? ck.TileMode.Repeat
        : mode === "fit"
            ? ck.TileMode.Decal
            : ck.TileMode.Clamp;

    const matrix = computeImageMatrix(img.width(), img.height(), fill, bounds);

    return img.makeShaderOptions(
        tileMode,
        tileMode,
        ck.FilterMode.Linear,
        ck.MipmapMode.None,
        matrix,
    );
}
