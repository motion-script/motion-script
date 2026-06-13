import { EllipseState, withEllipseDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";

type EllipseGeo = {
    cx: number; cy: number;
    halfWidth: number; halfHeight: number;
    left: number; right: number;
    sweep: number; isFullShape: boolean;
    startAngle: number;
};

/** Ellipse, optionally a partial arc (`sweep` < 360°) defined via SVG arc commands. */
export class EllipseShape extends BaseShape<EllipseState, EllipseGeo> {
    protected resolveState(state: Partial<EllipseState>): EllipseState {
        return withEllipseDescriptor(state);
    }

    protected computeGeometry(): EllipseGeo {
        const s = this.fullState;
        const halfWidth = s.width / 2;
        const halfHeight = s.height / 2;
        const left = s.x - halfWidth;
        const right = s.x + halfWidth;
        const sweep = s.sweep ?? 360;
        return {
            cx: s.x, cy: s.y,
            halfWidth, halfHeight,
            left, right,
            sweep,
            isFullShape: Math.abs(sweep) >= 360,
            startAngle: s.startAngle ?? 0,
        };
    }

    protected buildSVGPath(geo: EllipseGeo): string {
        const { cx, cy, halfWidth, halfHeight, left, right, sweep, isFullShape, startAngle } = geo;
        if (isFullShape) {
            return `M ${left} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${right} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${left} ${cy} Z`;
        }
        const endAngle = startAngle + sweep;
        const toRad = Math.PI / 180;
        const sx = cx + halfWidth * Math.cos(startAngle * toRad);
        const sy = cy + halfHeight * Math.sin(startAngle * toRad);
        const ex = cx + halfWidth * Math.cos(endAngle * toRad);
        const ey = cy + halfHeight * Math.sin(endAngle * toRad);
        const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
        const sweepFlag = sweep > 0 ? 1 : 0;
        return `M ${sx} ${sy} A ${halfWidth} ${halfHeight} 0 ${largeArc} ${sweepFlag} ${ex} ${ey}`;
    }

    protected override supportsSpread(): boolean {
        return true;
    }

    // Grow/shrink the ellipse by `spread` px on every side: each half-axis moves
    // by `spread`. Spread only makes sense for the full ellipse — a partial arc
    // bounds no region to inset — so arcs return null (no spread). A shrink that
    // collapses either axis returns null too.
    protected override buildSpreadSVGPath(geo: EllipseGeo, spread: number): string | null {
        if (!geo.isFullShape) return null;
        const halfWidth = geo.halfWidth + spread;
        const halfHeight = geo.halfHeight + spread;
        if (halfWidth <= 0 || halfHeight <= 0) return null;
        const { cx, cy } = geo;
        const left = cx - halfWidth;
        const right = cx + halfWidth;
        return `M ${left} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${right} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${left} ${cy} Z`;
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    protected computeBounds(geo: EllipseGeo) {
        const { cx, cy, halfWidth, halfHeight } = geo;
        return { left: cx - halfWidth, top: cy - halfHeight, right: cx + halfWidth, bottom: cy + halfHeight };
    }
}
