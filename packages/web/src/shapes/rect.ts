import type { Paint } from "@motion-script/canvaskit";
import {
    BorderRadiusResolved,
    RectState,
    isUniformBorderRadius,
    isZeroBorderRadius,
    resolveBorderRadius,
    withRectDescriptor,
} from "@motion-script/core";
import { BaseShape } from "./base";

type RectGeo = {
    left: number; top: number; right: number; bottom: number;
    tl: number; tr: number; br: number; bl: number;
    isZero: boolean; isUniform: boolean;
};

function roundedRectToSvg(
    l: number, t: number, r: number, b: number,
    tl: number, tr: number, br: number, bl: number,
): string {
    return [
        `M ${l + tl} ${t}`,
        `L ${r - tr} ${t}`,
        tr > 0 ? `A ${tr} ${tr} 0 0 1 ${r} ${t + tr}` : "",
        `L ${r} ${b - br}`,
        br > 0 ? `A ${br} ${br} 0 0 1 ${r - br} ${b}` : "",
        `L ${l + bl} ${b}`,
        bl > 0 ? `A ${bl} ${bl} 0 0 1 ${l} ${b - bl}` : "",
        `L ${l} ${t + tl}`,
        tl > 0 ? `A ${tl} ${tl} 0 0 1 ${l + tl} ${t}` : "",
        "Z",
    ].filter(Boolean).join(" ");
}

/**
 * Rect with optional per-corner radii. Radii are scaled down uniformly when
 * they'd overlap (sum exceeds the side length) to avoid self-intersecting
 * geometry. Isolated, untrimmed rects skip the SVG-path route entirely and
 * draw/clip via `drawRect`/`drawRRect` for cheaper rendering and crisper edges.
 */
export class RectShape extends BaseShape<RectState, RectGeo> {
    protected resolveState(state: Partial<RectState>): RectState {
        return withRectDescriptor(state);
    }

    protected computeGeometry(): RectGeo {
        const s = this.fullState;
        const halfWidth = s.width / 2;
        const halfHeight = s.height / 2;
        const left = s.x - halfWidth;
        const top = s.y - halfHeight;
        const right = s.x + halfWidth;
        const bottom = s.y + halfHeight;

        const rawBr: BorderRadiusResolved = resolveBorderRadius(s.borderRadius);
        let tl = Math.max(0, rawBr.topLeft);
        let tr = Math.max(0, rawBr.topRight);
        let br = Math.max(0, rawBr.bottomRight);
        let bl = Math.max(0, rawBr.bottomLeft);

        const w = s.width;
        const h = s.height;
        const scaleTop    = tl + tr > 0 ? Math.min(1, w / (tl + tr)) : 1;
        const scaleBottom = bl + br > 0 ? Math.min(1, w / (bl + br)) : 1;
        const scaleLeft   = tl + bl > 0 ? Math.min(1, h / (tl + bl)) : 1;
        const scaleRight  = tr + br > 0 ? Math.min(1, h / (tr + br)) : 1;
        const scale = Math.min(scaleTop, scaleBottom, scaleLeft, scaleRight);
        tl *= scale; tr *= scale; br *= scale; bl *= scale;

        const resolved: BorderRadiusResolved = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
        return {
            left, top, right, bottom,
            tl, tr, br, bl,
            isZero: isZeroBorderRadius(resolved),
            isUniform: isUniformBorderRadius(resolved),
        };
    }

    protected buildSVGPath(geo: RectGeo): string {
        const { left, top, right, bottom, tl, tr, br, bl, isZero, isUniform } = geo;
        if (isZero) {
            return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
        }
        if (isUniform) {
            return roundedRectToSvg(left, top, right, bottom, tl, tl, tl, tl);
        }
        return roundedRectToSvg(left, top, right, bottom, tl, tr, br, bl);
    }

    protected override supportsSpread(): boolean {
        return true;
    }

    // Grow/shrink the rect by `spread` px on every side: each edge moves out by
    // `spread` and each corner radius grows by `spread` (clamped at 0), matching
    // CSS box-shadow spread. Radii are re-clamped against the new size so they
    // never self-intersect. A shrink that collapses width or height returns null.
    protected override buildSpreadSVGPath(geo: RectGeo, spread: number): string | null {
        const left = geo.left - spread;
        const top = geo.top - spread;
        const right = geo.right + spread;
        const bottom = geo.bottom + spread;
        const w = right - left;
        const h = bottom - top;
        if (w <= 0 || h <= 0) return null;

        let tl = Math.max(0, geo.tl + spread);
        let tr = Math.max(0, geo.tr + spread);
        let br = Math.max(0, geo.br + spread);
        let bl = Math.max(0, geo.bl + spread);

        const scaleTop    = tl + tr > 0 ? Math.min(1, w / (tl + tr)) : 1;
        const scaleBottom = bl + br > 0 ? Math.min(1, w / (bl + br)) : 1;
        const scaleLeft   = tl + bl > 0 ? Math.min(1, h / (tl + bl)) : 1;
        const scaleRight  = tr + br > 0 ? Math.min(1, h / (tr + br)) : 1;
        const scale = Math.min(scaleTop, scaleBottom, scaleLeft, scaleRight);
        tl *= scale; tr *= scale; br *= scale; bl *= scale;

        if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
            return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
        }
        return roundedRectToSvg(left, top, right, bottom, tl, tr, br, bl);
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    protected computeBounds(geo: RectGeo) {
        return { left: geo.left, top: geo.top, right: geo.right, bottom: geo.bottom };
    }

    override draw(paint: Paint, isolated: boolean): void {
        const geo = this.geometry;
        if (isolated && !this.needsTrim() && !this.hasShapeTransform()) {
            const ck = this.canvasKit;
            const ltrb = ck.LTRBRect(geo.left, geo.top, geo.right, geo.bottom);
            if (geo.isZero) {
                this.canvas.drawRect(ltrb, paint);
                return;
            }
            if (geo.isUniform) {
                this.canvas.drawRRect(ck.RRectXY(ltrb, geo.tl, geo.tl), paint);
                return;
            }
        }
        super.draw(paint, isolated);
    }

    override clip(isolated: boolean): void {
        const geo = this.geometry;
        const ck = this.canvasKit;
        if (isolated && !this.needsTrim() && !this.hasShapeTransform()) {
            const ltrb = ck.LTRBRect(geo.left, geo.top, geo.right, geo.bottom);
            if (geo.isZero) {
                this.canvas.clipRect(ltrb, ck.ClipOp.Intersect, true);
                return;
            }
            if (geo.isUniform) {
                this.canvas.clipRRect(ck.RRectXY(ltrb, geo.tl, geo.tl), ck.ClipOp.Intersect, true);
                return;
            }
        }
        super.clip(isolated);
    }
}
