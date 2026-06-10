import type {
    CanvasKit,
    Canvas,
    Paint,
    Path as CKPath,
    Image as CKImage,
} from "@motion-script/canvaskit";
import {
    type FillResolved,
    type ImageFillResolved,
    type ImageState,
    type ShadowResolved,
    type StrokeResolved,
    withImageDescriptor,
} from "@motion-script/core";
import type { WebStorageAdapter } from "../storage-adapter";
import type { FillHandler, ShapeBounds } from "../fills/handler";
import type { ShapeHandler } from "./shape-handler";
import type { StrokeHandler } from "../stroke/stroke-handler";
import { computeImageMatrix, makeImageShader } from "../fills/image";
import { ImageFillFilterRegistry } from "../fills/filters/registry";

/**
 * Renders an Image node.
 *
 * Stroke / shadow / overlay-fill clipping follows the image's vector
 * silhouette, extracted once at decode time by the asset manager (marching
 * squares on the alpha channel, Douglas–Peucker simplified). That contour
 * lives in image-pixel space; for each draw we transform it through the same
 * matrix the image shader uses (so it lines up with the visible image), then
 * stroke / fill it like any other path.
 *
 * Per-draw pipeline:
 *   1. resolve CKImage and bounds.
 *   2. build the alpha path (cached behind the asset manager).
 *   3. shadows — stroke or fill the alpha path with shadow paint, blurred
 *      via a saveLayer image-filter.
 *   4. base image — drawRect with the image shader.
 *   5. overlay fills — fill the alpha path with each overlay fill.
 *   6. strokes — stroke the alpha path with each stroke fill. Skia's stroke
 *      primitive gives sharp edges at any weight, real round/miter joins,
 *      and dash support out of the box.
 */
export class ImageNodeRenderer {
    constructor(
        private canvasKit: CanvasKit,
        private getCanvas: () => Canvas,
        private getPaint: () => Paint,
        private assets: WebStorageAdapter,
        private fills: FillHandler,
        private shapeHandler: ShapeHandler,
        private strokes: StrokeHandler,
    ) { }

    /**
     * Returns `{ img, owned }`. `owned: true` means the caller created the
     * CKImage inline (from raw `state.data`) and must `.delete()` it after
     * drawing. `owned: false` means the storage adapter owns it.
     */
    private resolveImage(state: ImageState): { img: CKImage; owned: boolean } | null {
        if (state.src) {
            const img = this.assets.getCKImage(state.src);
            return img ? { img, owned: false } : null;
        }

        return null;
    }

    private toImageFillResolved(state: ImageState): ImageFillResolved {
        return {
            type: "image",
            src: state.src ?? "",
            mode: state.mode,
            transform: state.transform,
            scaling: state.scaling,
            filters: state.filters,
        };
    }

    /**
     * Build a CKPath from the cached alpha contours, with each vertex pre-
     * transformed from image-pixel space into the destination bounds. The
     * matrix matches the image shader's matrix so the path lines up with
     * the visible image. Caller owns the returned path (.delete() when done).
     * Returns null if no contour is cached.
     */
    private buildAlphaPath(img: CKImage, state: ImageState, bounds: ShapeBounds): CKPath | null {
        if (!state.src) return null;
        const contours = (this.assets as any).getAlphaContour?.(state.src) as Array<ArrayLike<number>> | null | undefined;
        if (!contours || contours.length === 0) return null;

        const m = computeImageMatrix(img.width(), img.height(), this.toImageFillResolved(state), bounds);
        // m is row-major 3×3: [sx, shx, tx, shy, sy, ty, …] (no perspective).
        const sx = m[0], shx = m[1], tx = m[2];
        const shy = m[3], sy = m[4], ty = m[5];

        // Build an SVG path string; CanvasKit's Path types expose
        // MakeFromSVGString but not the runtime moveTo/lineTo methods.
        const parts: string[] = [];
        for (const contour of contours) {
            if (contour.length < 4) continue;
            const x0 = sx * contour[0] + shx * contour[1] + tx;
            const y0 = shy * contour[0] + sy * contour[1] + ty;
            parts.push(`M${x0.toFixed(2)},${y0.toFixed(2)}`);
            for (let i = 2; i < contour.length; i += 2) {
                const px = sx * contour[i] + shx * contour[i + 1] + tx;
                const py = shy * contour[i] + sy * contour[i + 1] + ty;
                parts.push(`L${px.toFixed(2)},${py.toFixed(2)}`);
            }
            parts.push("Z");
        }
        if (parts.length === 0) return null;

        const path = this.canvasKit.Path.MakeFromSVGString(parts.join(""));
        if (!path) return null;
        path.setFillType(this.canvasKit.FillType.EvenOdd);
        return path;
    }

    draw(
        state: ImageState,
        shadows: ShadowResolved[],
        overlayFills: FillResolved[],
        strokes: StrokeResolved[],
    ): void {
        const canvas = this.getCanvas();
        const ck = this.canvasKit;

        const resolved = this.resolveImage(state);
        if (!resolved) return;
        const { img, owned } = resolved;

        const halfW = state.width / 2;
        const halfH = state.height / 2;
        const bounds: ShapeBounds = {
            left: state.x - halfW,
            top: state.y - halfH,
            right: state.x + halfW,
            bottom: state.y + halfH,
        };
        const boundsRect = ck.LTRBRect(bounds.left, bounds.top, bounds.right, bounds.bottom);
        const imageFill = this.toImageFillResolved(state);

        // Path may be null if the image is still decoding or has no alpha
        // contour. We fall back to drawing strokes/shadows around the rect
        // bounds in that case (matches Box behaviour).
        const alphaPath = this.buildAlphaPath(img, state, bounds);

        this.shapeHandler.pushBounds(bounds);
        try {
            for (const shadow of shadows) {
                this.drawShadow(canvas, alphaPath, boundsRect, shadow, overlayFills, strokes);
            }

            this.drawImage(canvas, img, imageFill, bounds, boundsRect);

            if (overlayFills.length > 0) {
                this.drawOverlayFills(canvas, alphaPath, boundsRect, overlayFills);
            }

            for (const stroke of strokes) {
                this.drawStroke(canvas, alphaPath, boundsRect, stroke);
            }
        } finally {
            this.shapeHandler.popBounds();
            alphaPath?.delete();
            // Only the `state.data` (inline) path produces a renderer-owned
            // CKImage. The adapter-cached path is released by the adapter
            // when underlying pixels are evicted.
            if (owned) img.delete();
        }
    }

    private drawImage(
        canvas: Canvas,
        img: CKImage,
        imageFill: ImageFillResolved,
        bounds: ShapeBounds,
        boundsRect: Float32Array,
    ): void {
        const ck = this.canvasKit;
        const paint = this.getPaint();
        paint.setStyle(ck.PaintStyle.Fill);
        paint.setAlphaf(imageFill.opacity ?? 1);
        paint.setBlendMode(ck.BlendMode.SrcOver);
        paint.setShader(makeImageShader(img, imageFill, ck, bounds));
        this.applyFilters(paint, imageFill);
        canvas.drawRect(boundsRect, paint);
        paint.setShader(null);
        paint.setImageFilter(null);
        paint.setAlphaf(1);
    }

    private applyFilters(paint: Paint, fill: ImageFillResolved): void {
        if (!fill.filters || fill.filters.length === 0) {
            paint.setImageFilter(null);
            return;
        }
        const composed = ImageFillFilterRegistry.compose(fill.filters, this.canvasKit);
        paint.setImageFilter(composed);
    }

    /**
     * Drop shadow following the alpha contour. Renders the silhouette filled
     * with the shadow fill into a blurred + translated saveLayer.
     */
    private drawShadow(
        canvas: Canvas,
        alphaPath: CKPath | null,
        boundsRect: Float32Array,
        shadow: ShadowResolved,
        _overlayFills: FillResolved[],
        _strokes: StrokeResolved[],
    ): void {
        const ck = this.canvasKit;
        const dx = shadow.dx ?? 0;
        const dy = shadow.dy ?? 0;

        const layerPaint = new ck.Paint();
        if (shadow.blur > 0) {
            const sigma = shadow.blur / 2;
            layerPaint.setImageFilter(
                ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null),
            );
        }

        canvas.save();
        // Scene coords are Y-up; the canvas is Y-down, so negate dy to keep a
        // positive dy nudging the shadow upward.
        canvas.translate(dx, -dy);
        canvas.saveLayer(layerPaint);

        const shape: { draw: (p: Paint) => void; ckPath?: CKPath } = alphaPath
            ? { draw: (p) => canvas.drawPath(alphaPath, p), ckPath: alphaPath }
            : { draw: (p) => canvas.drawRect(boundsRect, p) };

        this.fills.applyFills(shadow.fill, [shape]);

        canvas.restore();
        canvas.restore();
        layerPaint.delete();
    }

    /** Overlay fills clipped to the alpha contour (or rect if no contour). */
    private drawOverlayFills(
        canvas: Canvas,
        alphaPath: CKPath | null,
        boundsRect: Float32Array,
        overlayFills: FillResolved[],
    ): void {
        const shape: { draw: (p: Paint) => void; ckPath?: CKPath } = alphaPath
            ? { draw: (p) => canvas.drawPath(alphaPath, p), ckPath: alphaPath }
            : { draw: (p) => canvas.drawRect(boundsRect, p) };
        this.fills.applyFills(overlayFills, [shape]);
    }

    /** Stroke the alpha contour. Sharp edges at any weight, real joins, dash support. */
    private drawStroke(
        canvas: Canvas,
        alphaPath: CKPath | null,
        boundsRect: Float32Array,
        stroke: StrokeResolved,
    ): void {
        const shape: { draw: (p: Paint) => void; ckPath?: CKPath } = alphaPath
            ? { draw: (p) => canvas.drawPath(alphaPath, p), ckPath: alphaPath }
            : { draw: (p) => canvas.drawRect(boundsRect, p) };
        this.strokes.applyStrokes([stroke], [shape]);
    }
}

export { withImageDescriptor };
