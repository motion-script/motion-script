import type { LinearGradientFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { GradientShaderCache, toCkColors, pushNums } from "./gradient-cache";

// Converts a normalized coordinate (-1..1, extendable beyond for world-space)
// to a pixel position within the shape's bounds.
// x: -1 = left edge, +1 = right edge  |  y: -1 = bottom edge, +1 = top edge
function normToPixel(nx: number, ny: number, bounds: { left: number; top: number; right: number; bottom: number }): [number, number] {
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    const hw = (bounds.right - bounds.left) / 2;
    const hh = (bounds.bottom - bounds.top) / 2;
    return [cx + nx * hw, cy - ny * hh]; // y is flipped: +1 = top = smaller canvas y
}

/**
 * Builds (and caches via GradientShaderCache, keyed on resolved endpoints +
 * stops) a linear-gradient shader resolved against the current shape bounds.
 */
export class LinearGradientFillRenderer extends FillRenderer<LinearGradientFillResolved> {
    private cache = new GradientShaderCache();

    applyPaint(fill: LinearGradientFillResolved, ctx: FillRendererContext): boolean {
        const ck = ctx.canvasKit;
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const start = normToPixel(fill.start.x, fill.start.y, bounds);
        const end = normToPixel(fill.end.x, fill.end.y, bounds);

        const parts: string[] = ["L"];
        pushNums(parts, start);
        pushNums(parts, end);
        for (const c of fill.colors) pushNums(parts, c);
        parts.push("|");
        pushNums(parts, fill.stops);
        const key = parts.join(",");

        const shader = this.cache.get(key, () => {
            const ckColors = toCkColors(ck, fill.colors);
            const pos = fill.stops.length === ckColors.length
                ? fill.stops
                : ckColors.map((_, i) => i / (ckColors.length - 1));
            return ck.Shader.MakeLinearGradient(start, end, ckColors, pos, ck.TileMode.Clamp);
        });
        ctx.paint.setShader(shader);
        return true;
    }

    dispose(): void {
        this.cache.dispose();
    }
}
