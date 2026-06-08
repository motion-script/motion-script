import type { RadialGradientFillResolved } from "@motion-script/core";
import { FillRenderer, type FillRendererContext } from "./renderer";
import { GradientShaderCache, toCkColors, pushNums } from "./gradient-cache";

// center: normalized -1..1 (x: -1=left +1=right, y: +1=top -1=bottom)
// radius: in pixels (absolute)
function normToPixel(nx: number, ny: number, bounds: { left: number; top: number; right: number; bottom: number }): [number, number] {
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    const hw = (bounds.right - bounds.left) / 2;
    const hh = (bounds.bottom - bounds.top) / 2;
    return [cx + nx * hw, cy - ny * hh];
}

/** Builds and caches a radial-gradient shader resolved against the shape bounds (see linear-gradient for the caching pattern). */
export class RadialGradientFillRenderer extends FillRenderer<RadialGradientFillResolved> {
    private cache = new GradientShaderCache();

    applyPaint(fill: RadialGradientFillResolved, ctx: FillRendererContext): boolean {
        const ck = ctx.canvasKit;
        const bounds = ctx.getShapeBounds();
        if (!bounds) return false;

        const center = normToPixel(fill.center.x, fill.center.y, bounds);

        const parts: string[] = ["R"];
        pushNums(parts, center);
        pushNums(parts, [fill.radius]);
        for (const c of fill.colors) pushNums(parts, c);
        parts.push("|");
        pushNums(parts, fill.stops);
        const key = parts.join(",");

        const shader = this.cache.get(key, () => {
            const ckColors = toCkColors(ck, fill.colors);
            const pos = fill.stops.length === ckColors.length
                ? fill.stops
                : ckColors.map((_, i) => i / (ckColors.length - 1));
            return ck.Shader.MakeRadialGradient(center, fill.radius, ckColors, pos, ck.TileMode.Clamp);
        });
        ctx.paint.setShader(shader);
        return true;
    }

    dispose(): void {
        this.cache.dispose();
    }
}
