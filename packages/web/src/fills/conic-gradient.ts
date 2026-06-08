import type { ConicGradientFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { GradientShaderCache, toCkColors, pushNums } from "./gradient-cache";

function normToPixel(nx: number, ny: number, bounds: { left: number; top: number; right: number; bottom: number }): [number, number] {
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    const hw = (bounds.right - bounds.left) / 2;
    const hh = (bounds.bottom - bounds.top) / 2;
    return [cx + nx * hw, cy - ny * hh];
}

/**
 * Builds and caches a sweep-gradient shader spanning a full revolution from
 * `startAngle` (see linear-gradient for the caching pattern).
 */
export class ConicGradientFillRenderer extends FillRenderer<ConicGradientFillResolved> {
    private cache = new GradientShaderCache();

    applyPaint(fill: ConicGradientFillResolved, ctx: FillRendererContext): boolean {
        const ck = ctx.canvasKit;
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const [cx, cy] = normToPixel(fill.center.x, fill.center.y, bounds);
        const startAngle = fill.startAngle ?? 0;

        const parts: string[] = ["C"];
        pushNums(parts, [cx, cy, startAngle]);
        for (const c of fill.colors) pushNums(parts, c);
        parts.push("|");
        pushNums(parts, fill.stops);
        const key = parts.join(",");

        const shader = this.cache.get(key, () => {
            const ckColors = toCkColors(ck, fill.colors);
            const pos = fill.stops.length === ckColors.length
                ? fill.stops
                : ckColors.map((_, i) => i / (ckColors.length - 1));
            return ck.Shader.MakeSweepGradient(
                cx,
                cy,
                ckColors,
                pos,
                ck.TileMode.Clamp,
                null,
                0,
                startAngle,
                startAngle + 360,
            );
        });
        ctx.paint.setShader(shader);
        return true;
    }

    dispose(): void {
        this.cache.dispose();
    }
}
