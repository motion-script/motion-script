import type { StripeFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";

const stripeCache = new Map<string, any>();

function buildCacheKey(fill: StripeFillResolved): string {
    const gap = fill.gap ?? 8;
    const sw = fill.strokeWidth ?? 1;
    const [r, g, b, a] = fill.color ?? [0, 0, 0, 1];
    return `${gap}|${sw}|${r},${g},${b},${a}`;
}

/**
 * Renders a stripe tile onto the offscreen 2D canvas — no rotation applied.
 * The tile is `gap × gap` pixels with a single vertical line of `strokeWidth`
 * at x = strokeWidth/2 (same clip-prevention offset as the SVG component).
 * Rotation is handled by the CanvasKit shader matrix in applyPaint.
 */
function renderStripeTile(
    fill: StripeFillResolved,
    offscreen: HTMLCanvasElement,
    offscreenCtx: CanvasRenderingContext2D,
    ck: any,
): any {
    const gap = fill.gap ?? 8;
    const sw = fill.strokeWidth ?? 1;
    const [cr, cg, cb, ca] = fill.color ?? [0, 0, 0, 1];
    const cssColor = `rgba(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)},${ca})`;

    offscreen.width = gap;
    offscreen.height = gap;
    offscreenCtx.clearRect(0, 0, gap, gap);

    offscreenCtx.strokeStyle = cssColor;
    offscreenCtx.lineWidth = sw;

    // Vertical line at x = sw/2 — same as SVG x1={offset}
    const offset = sw / 2;
    offscreenCtx.beginPath();
    offscreenCtx.moveTo(offset, 0);
    offscreenCtx.lineTo(offset, gap);
    offscreenCtx.stroke();

    const imageData = offscreenCtx.getImageData(0, 0, gap, gap);

    return ck.MakeImage(
        {
            width: gap,
            height: gap,
            alphaType: ck.AlphaType.Unpremul,
            colorType: ck.ColorType.RGBA_8888,
            colorSpace: ck.ColorSpace.SRGB,
        },
        imageData.data,
        4 * gap,
    );
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
        if (!ctx.offscreenCanvas) {
            ctx.offscreenCanvas = document.createElement("canvas");
            ctx.offscreenCtx = ctx.offscreenCanvas.getContext("2d");
        }
        if (!ctx.offscreenCtx) return false;

        const key = buildCacheKey(fill);
        let img = stripeCache.get(key);
        if (!img) {
            img = renderStripeTile(fill, ctx.offscreenCanvas, ctx.offscreenCtx, ctx.canvasKit);
            if (!img) return false;
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
}
