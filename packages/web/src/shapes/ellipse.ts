import { EllipseState, withEllipseDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";

type EllipseGeo = {
    cx: number; cy: number;
    halfWidth: number; halfHeight: number;
    left: number; right: number;
    sweep: number; isFullShape: boolean;
    startAngle: number;
    // Inner radius as a fraction (0..1) of the outer radius. 0 = solid pie/disk,
    // >0 = donut/annulus with a hole, 1 = no enclosed area (a bare arc/ring).
    ratio: number;
};

/**
 * Ellipse, optionally a partial arc (`sweep` < 360°) and/or an inner hole
 * (`ratio` > 0). `ratio` is the inner radius as a fraction of the outer:
 *   - 0   → solid wedge (pie / Pac-Man when sweep < 360, full disk at 360)
 *   - 0.5 → donut / annular sector
 *   - 1   → inner edge meets the outer edge, leaving just the bare arc/ring
 * Geometry is emitted as SVG arc commands.
 */
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
            ratio: Math.max(0, Math.min(1, s.ratio ?? 1)),
        };
    }

    protected buildSVGPath(geo: EllipseGeo): string {
        const { cx, cy, halfWidth, halfHeight, left, right, sweep, isFullShape, startAngle, ratio } = geo;
        // `ratio` is the inner radius as a fraction of the outer. The stroke
        // traces the perimeter of the enclosed region (donut / pie outline),
        // matching Polygram. Geometry stays a single CONTINUOUS family across the
        // whole range so animating `ratio` never pops between path topologies:
        //   - ratio < 1 → a closed region (annulus / annular sector / wedge)
        //   - ratio → 1 → the band's width → 0, so the region degenerates to the
        //                 bare outer curve, which is exactly what we emit there.
        // The only special-cased frame is ratio === 1: a zero-area region would
        // otherwise stroke out-and-back over itself (a doubled line). Emitting the
        // bare outer curve is the geometric limit of the family, so the transition
        // is visually continuous rather than a topology flip.
        const innerW = halfWidth * ratio;
        const innerH = halfHeight * ratio;
        const isDegenerate = ratio >= 1;

        if (isFullShape) {
            // Outer ellipse, drawn as two semicircular arcs.
            const outer = `M ${left} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${right} ${cy} A ${halfWidth} ${halfHeight} 0 1 0 ${left} ${cy} Z`;
            // ratio 0 = solid disk, ratio 1 = bare ellipse outline (zero-area ring).
            if (ratio <= 0 || isDegenerate) return outer;
            // Inner ellipse wound the opposite way (sweepFlag 1) so the even-odd /
            // nonzero fill leaves a hole — an annulus.
            const il = cx - innerW;
            const ir = cx + innerW;
            const inner = `M ${il} ${cy} A ${innerW} ${innerH} 0 1 1 ${ir} ${cy} A ${innerW} ${innerH} 0 1 1 ${il} ${cy} Z`;
            return `${outer} ${inner}`;
        }

        const endAngle = startAngle + sweep;
        const toRad = Math.PI / 180;
        const sx = cx + halfWidth * Math.cos(startAngle * toRad);
        const sy = cy + halfHeight * Math.sin(startAngle * toRad);
        const ex = cx + halfWidth * Math.cos(endAngle * toRad);
        const ey = cy + halfHeight * Math.sin(endAngle * toRad);
        const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
        const sweepFlag = sweep > 0 ? 1 : 0;
        const outerArc = `A ${halfWidth} ${halfHeight} 0 ${largeArc} ${sweepFlag} ${ex} ${ey}`;

        if (isDegenerate) {
            // ratio 1 limit: the band has collapsed to the outer curve. Bare arc.
            return `M ${sx} ${sy} ${outerArc}`;
        }

        if (ratio <= 0) {
            // Solid wedge: outer arc, then straight edges in to the centre (pie / Pac-Man).
            return `M ${cx} ${cy} L ${sx} ${sy} ${outerArc} Z`;
        }

        // Annular sector: outer arc out, radial step in to the inner edge, inner
        // arc back (reverse sweep), then close along the start radius.
        const isx = cx + innerW * Math.cos(startAngle * toRad);
        const isy = cy + innerH * Math.sin(startAngle * toRad);
        const iex = cx + innerW * Math.cos(endAngle * toRad);
        const iey = cy + innerH * Math.sin(endAngle * toRad);
        const innerSweepFlag = sweep > 0 ? 0 : 1;
        return `M ${sx} ${sy} ${outerArc} L ${iex} ${iey} A ${innerW} ${innerH} 0 ${largeArc} ${innerSweepFlag} ${isx} ${isy} Z`;
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
