import type { CanvasKit, Image as CKImage } from "@motion-script/canvaskit";
import type { StripeFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";

/**
 * Baked stripe tiles, keyed by the parameters that define one.
 *
 * Process-wide and unbounded by design — a tile is at most a few KB and the set
 * of distinct stripe styles in a project is tiny — but the `CKImage` handles are
 * wasm-side and not GC-managed, so {@link StripeFillRenderer.dispose} frees them
 * when the render context goes away (HMR remount, scene switch).
 */
const stripeCache = new Map<string, CKImage>();

function buildCacheKey(fill: StripeFillResolved): string {
    const gap = fill.gap ?? 8;
    const sw = fill.strokeWidth ?? 1;
    const [r, g, b, a] = fill.color ?? [0, 0, 0, 1];
    return `${gap}|${sw}|${r},${g},${b},${a}`;
}

/**
 * Bakes a stripe tile — no rotation applied. The tile is `gap × gap` pixels with
 * a single vertical line of `strokeWidth` at x = strokeWidth/2 (the same
 * clip-prevention offset as the SVG component). Rotation is handled by the
 * CanvasKit shader matrix in applyPaint.
 *
 * Drawn on a Skia raster surface rather than a 2D canvas: the tile is tiny and
 * read straight back to bytes, so there is nothing to gain from the GPU and no
 * reason for this package's renderer layer to need a DOM canvas at all.
 *
 * `MakeSurface` gives an **Unpremul** RGBA_8888/sRGB CPU surface, which is
 * exactly the format `getImageData` used to hand back — so the readback below
 * and the `MakeImage` info agree with each other and with what the shader
 * expects. Reading premultiplied here would shift every antialiased edge pixel.
 */
function renderStripeTile(fill: StripeFillResolved, ck: CanvasKit): CKImage | null {
    const gap = Math.max(1, Math.round(fill.gap ?? 8));
    const sw = fill.strokeWidth ?? 1;
    const [cr, cg, cb, ca] = fill.color ?? [0, 0, 0, 1];

    const surface = ck.MakeSurface(gap, gap);
    if (!surface) return null;
    const paint = new ck.Paint();
    try {
        const canvas = surface.getCanvas();
        canvas.clear(ck.TRANSPARENT);

        paint.setAntiAlias(true);
        paint.setStyle(ck.PaintStyle.Stroke);
        paint.setStrokeWidth(sw);
        // `ck.Color` takes 0-255 channels, so this reproduces the 1/255
        // quantization the replaced `rgba(...)` CSS string imposed. Skia could
        // take the exact floats via Color4f, but matching the old rounding keeps
        // this refactor byte-identical; switching to Color4f is a deliberate
        // (if imperceptible) pixel change and belongs in its own commit.
        paint.setColor(ck.Color(
            Math.round(cr * 255),
            Math.round(cg * 255),
            Math.round(cb * 255),
            ca,
        ));

        // Vertical line at x = sw/2 — same as SVG x1={offset}. Half the stroke
        // falls outside the tile, which is what the repeat tiling relies on.
        const offset = sw / 2;
        canvas.drawLine(offset, 0, offset, gap, paint);
        surface.flush();

        // Read back to bytes rather than keeping the snapshot: the cache holds
        // this image indefinitely, and a snapshot's pixels belong to the surface
        // being deleted in the finally block below.
        const snapshot = surface.makeImageSnapshot();
        const pixels = snapshot?.readPixels(0, 0, {
            width: gap,
            height: gap,
            alphaType: ck.AlphaType.Unpremul,
            colorType: ck.ColorType.RGBA_8888,
            colorSpace: ck.ColorSpace.SRGB,
        }) as Uint8Array | null;
        snapshot?.delete();
        if (!pixels) return null;

        return ck.MakeImage(
            {
                width: gap,
                height: gap,
                alphaType: ck.AlphaType.Unpremul,
                colorType: ck.ColorType.RGBA_8888,
                colorSpace: ck.ColorSpace.SRGB,
            },
            // Copy out of the wasm heap — the snapshot's buffer is not ours to keep.
            new Uint8Array(pixels),
            4 * gap,
        );
    } finally {
        paint.delete();
        surface.delete();
    }
}

/**
 * Builds a 3×3 affine matrix (row-major, as CanvasKit expects) that:
 *   1. Rotates by `angleDeg` around the shape's top-left corner
 *   2. Translates so the pattern starts at the shape origin
 *
 * This is equivalent to SVG patternTransform="rotate(angle)" — the tile
 * itself is axis-aligned; CanvasKit rotates the repeating space.
 */
function makeRotatedMatrix(angleDeg: number, tx: number, ty: number): number[] {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Rotate around (tx, ty): translate to origin, rotate, translate back
    return [
        cos, -sin, tx - cos * tx + sin * ty,
        sin,  cos, ty - sin * tx - cos * ty,
        0,    0,   1,
    ];
}

/** Renders a repeating diagonal-stripe pattern from a cached single-tile image. */
export class StripeFillRenderer extends FillRenderer<StripeFillResolved> {
    applyPaint(fill: StripeFillResolved, ctx: FillRendererContext): boolean {
        const key = buildCacheKey(fill);
        let img = stripeCache.get(key);
        if (!img) {
            const made = renderStripeTile(fill, ctx.canvasKit);
            if (!made) return false;
            img = made;
            stripeCache.set(key, img);
        }

        const bounds = ctx.getShapeBounds();
        const tx = bounds?.left ?? 0;
        const ty = bounds?.top ?? 0;
        const angle = fill.angle ?? -45;

        const matrix = makeRotatedMatrix(angle, tx, ty);

        ctx.paint.setShader(
            img.makeShaderOptions(
                ctx.canvasKit.TileMode.Repeat,
                ctx.canvasKit.TileMode.Repeat,
                ctx.canvasKit.FilterMode.Linear,
                ctx.canvasKit.MipmapMode.None,
                matrix,
            ),
        );
        return true;
    }

    /**
     * Free the baked tiles.
     *
     * Currently latent: `FillRenderRegistry.disposeRenderers()` is the only thing
     * that would call this and nothing calls *it* — the same is true of the
     * gradient and fractal-noise renderers' `dispose()`. Implemented anyway so
     * that wiring the registry up (which needs the shared-static-registry
     * lifetime question settled first) frees these tiles without a second pass.
     */
    override dispose(): void {
        for (const img of stripeCache.values()) img.delete();
        stripeCache.clear();
    }
}
