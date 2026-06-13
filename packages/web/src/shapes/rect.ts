import type { Paint } from "@motion-script/canvaskit";
import {
    CornerRadiusResolved,
    CornerStyleResolved,
    RectState,
    isUniformCornerRadius,
    isZeroCornerRadius,
    resolveCornerRadius,
    resolveCornerStyle,
    withRectDescriptor,
} from "@motion-script/core";
import { BaseShape } from "./base";
import { cornerCommands, cornerReach, CornerSpec } from "./corner";

type RectGeo = {
    left: number; top: number; right: number; bottom: number;
    tl: CornerSpec; tr: CornerSpec; br: CornerSpec; bl: CornerSpec;
    isZero: boolean; isUniform: boolean; isPlainRounded: boolean;
};

/**
 * Builds the rect outline as a clockwise path, dispatching each corner to its
 * own arc or chamfer geometry. The straight edges run between the points where
 * each corner's curve begins, which is `radius` px from the apex.
 */
function rectToSvg(
    l: number, t: number, r: number, b: number,
    tl: CornerSpec, tr: CornerSpec, br: CornerSpec, bl: CornerSpec,
): string {
    const rTL = cornerReach(tl), rTR = cornerReach(tr), rBR = cornerReach(br), rBL = cornerReach(bl);
    // Each corner sits at an apex; its two unit edge directions point away from
    // the apex along the two adjacent sides. Commands enter along the first
    // direction and leave along the second, matching the clockwise winding.
    return [
        `M ${l + rTL} ${t}`,
        `L ${r - rTR} ${t}`,
        // top-right apex (r, t): enter from the left, leave downward.
        cornerCommands(r, t, -1, 0, 0, 1, tr),
        `L ${r} ${b - rBR}`,
        // bottom-right apex (r, b): enter from above, leave leftward.
        cornerCommands(r, b, 0, -1, -1, 0, br),
        `L ${l + rBL} ${b}`,
        // bottom-left apex (l, b): enter from the right, leave upward.
        cornerCommands(l, b, 1, 0, 0, -1, bl),
        `L ${l} ${t + rTL}`,
        // top-left apex (l, t): enter from below, leave rightward.
        cornerCommands(l, t, 0, 1, 1, 0, tl),
        "Z",
    ].filter(Boolean).join(" ");
}

/**
 * Rect with optional per-corner radii and styles. Radii are scaled down
 * uniformly when they'd overlap (sum exceeds the side length) to avoid
 * self-intersecting geometry. Isolated, untrimmed, plain-rounded rects skip the
 * SVG-path route entirely and draw/clip via `drawRect`/`drawRRect` for cheaper
 * rendering and crisper edges.
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

        const radius: CornerRadiusResolved = resolveCornerRadius(s.cornerRadius);
        const style: CornerStyleResolved = resolveCornerStyle(s.cornerStyle);

        const tl: CornerSpec = { radius: Math.max(0, radius.topLeft), style: style.topLeft };
        const tr: CornerSpec = { radius: Math.max(0, radius.topRight), style: style.topRight };
        const br: CornerSpec = { radius: Math.max(0, radius.bottomRight), style: style.bottomRight };
        const bl: CornerSpec = { radius: Math.max(0, radius.bottomLeft), style: style.bottomLeft };

        // Scale all radii down uniformly so adjacent corners never overrun a side.
        const scale = cornerScale(s.width, s.height, tl, tr, br, bl);
        tl.radius *= scale; tr.radius *= scale; br.radius *= scale; bl.radius *= scale;

        const resolved: CornerRadiusResolved = {
            topLeft: tl.radius, topRight: tr.radius, bottomRight: br.radius, bottomLeft: bl.radius,
        };
        const allRounded =
            style.topLeft === "rounded" && style.topRight === "rounded" &&
            style.bottomRight === "rounded" && style.bottomLeft === "rounded";
        return {
            left, top, right, bottom,
            tl, tr, br, bl,
            isZero: isZeroCornerRadius(resolved),
            isUniform: isUniformCornerRadius(resolved),
            isPlainRounded: allRounded,
        };
    }

    protected buildSVGPath(geo: RectGeo): string {
        const { left, top, right, bottom, tl, tr, br, bl, isZero } = geo;
        if (isZero) {
            return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
        }
        return rectToSvg(left, top, right, bottom, tl, tr, br, bl);
    }

    protected override supportsSpread(): boolean {
        return true;
    }

    // Grow/shrink the rect by `spread` px on every side: each edge moves out by
    // `spread` and each corner radius grows by `spread` (clamped at 0), matching
    // CSS box-shadow spread. Radii are re-clamped against the new size so they
    // never self-intersect. Corner style is unitless and carries through
    // unchanged. A shrink that collapses width or height returns null.
    protected override buildSpreadSVGPath(geo: RectGeo, spread: number): string | null {
        const left = geo.left - spread;
        const top = geo.top - spread;
        const right = geo.right + spread;
        const bottom = geo.bottom + spread;
        const w = right - left;
        const h = bottom - top;
        if (w <= 0 || h <= 0) return null;

        const tl: CornerSpec = { ...geo.tl, radius: Math.max(0, geo.tl.radius + spread) };
        const tr: CornerSpec = { ...geo.tr, radius: Math.max(0, geo.tr.radius + spread) };
        const br: CornerSpec = { ...geo.br, radius: Math.max(0, geo.br.radius + spread) };
        const bl: CornerSpec = { ...geo.bl, radius: Math.max(0, geo.bl.radius + spread) };

        const scale = cornerScale(w, h, tl, tr, br, bl);
        tl.radius *= scale; tr.radius *= scale; br.radius *= scale; bl.radius *= scale;

        if (tl.radius === 0 && tr.radius === 0 && br.radius === 0 && bl.radius === 0) {
            return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
        }
        return rectToSvg(left, top, right, bottom, tl, tr, br, bl);
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
            if (geo.isUniform && geo.isPlainRounded) {
                this.canvas.drawRRect(ck.RRectXY(ltrb, geo.tl.radius, geo.tl.radius), paint);
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
            if (geo.isUniform && geo.isPlainRounded) {
                this.canvas.clipRRect(ck.RRectXY(ltrb, geo.tl.radius, geo.tl.radius), ck.ClipOp.Intersect, true);
                return;
            }
        }
        super.clip(isolated);
    }
}

// Uniform scale factor that keeps every pair of adjacent corners' radii within
// the side they share, so they never overrun.
function cornerScale(w: number, h: number, tl: CornerSpec, tr: CornerSpec, br: CornerSpec, bl: CornerSpec): number {
    const rTL = cornerReach(tl), rTR = cornerReach(tr), rBR = cornerReach(br), rBL = cornerReach(bl);
    const scaleTop    = rTL + rTR > 0 ? Math.min(1, w / (rTL + rTR)) : 1;
    const scaleBottom = rBL + rBR > 0 ? Math.min(1, w / (rBL + rBR)) : 1;
    const scaleLeft   = rTL + rBL > 0 ? Math.min(1, h / (rTL + rBL)) : 1;
    const scaleRight  = rTR + rBR > 0 ? Math.min(1, h / (rTR + rBR)) : 1;
    return Math.min(scaleTop, scaleBottom, scaleLeft, scaleRight);
}
