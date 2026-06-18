import { CornerStyle, PolygonState, withPolygonDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";
import { cornerCommandsFromCut } from "./corner";

type PolygonGeo = {
    cx: number; cy: number;
    rx: number; ry: number;
    sides: number;
    cornerRadius: number;
    cornerStyle: CornerStyle;
};

function buildPolygonSvg(
    cx: number, cy: number,
    rx: number, ry: number,
    sides: number,
    cornerRadius: number,
    cornerStyle: CornerStyle,
): string {
    const angleStep = (2 * Math.PI) / sides;
    const startAngle = -Math.PI / 2;

    const verts: [number, number][] = [];
    for (let i = 0; i < sides; i++) {
        const a = startAngle + i * angleStep;
        verts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }

    if (cornerRadius <= 0) {
        const parts = verts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`);
        parts.push("Z");
        return parts.join(" ");
    }

    const parts: string[] = [];
    for (let i = 0; i < sides; i++) {
        const prev = verts[(i - 1 + sides) % sides];
        const curr = verts[i];
        const next = verts[(i + 1) % sides];

        const a0x = prev[0] - curr[0];
        const a0y = prev[1] - curr[1];
        const len0 = Math.hypot(a0x, a0y);
        const u0x = a0x / len0;
        const u0y = a0y / len0;

        const a1x = next[0] - curr[0];
        const a1y = next[1] - curr[1];
        const len1 = Math.hypot(a1x, a1y);
        const u1x = a1x / len1;
        const u1y = a1y / len1;

        const cosAngle = Math.max(-1, Math.min(1, u0x * u1x + u0y * u1y));
        const halfAngle = Math.acos(cosAngle) / 2;
        const tanHalf = Math.tan(halfAngle);

        // Cut-back distance `t` along each edge for the requested radius, clamped
        // so neither adjacent corner overruns half the shared edge.
        const maxT = Math.min(len0, len1) / 2;
        let t = cornerRadius / tanHalf;
        if (t > maxT) t = maxT;
        const r = t * tanHalf;

        // The corner's curve begins where the straight edge ends: `t` from the apex.
        const edgeX = curr[0] + u0x * t;
        const edgeY = curr[1] + u0y * t;

        parts.push(`${parts.length === 0 ? "M" : "L"} ${edgeX} ${edgeY}`);
        parts.push(cornerCommandsFromCut(curr[0], curr[1], u0x, u0y, u1x, u1y, t, r, cornerStyle));
    }
    parts.push("Z");
    return parts.join(" ");
}

/**
 * Regular polygon inscribed in an ellipse (rx/ry from width/height), starting
 * at the top vertex. `cornerRadius` rounds each vertex by arcing between
 * cut-back points on the adjacent edges, clamped so adjacent arcs never overlap.
 * `cornerStyle` switches each vertex between a circular arc and a straight chamfer.
 */
export class PolygonShape extends BaseShape<PolygonState, PolygonGeo> {
    protected resolveState(state: Partial<PolygonState>): PolygonState {
        return withPolygonDescriptor(state);
    }

    protected computeGeometry(): PolygonGeo {
        const s = this.fullState;
        return {
            cx: s.x, cy: s.y,
            rx: s.width / 2,
            ry: s.height / 2,
            sides: Math.max(3, Math.round(s.sides)),
            cornerRadius: s.cornerRadius,
            cornerStyle: s.cornerStyle,
        };
    }

    protected buildSVGPath(geo: PolygonGeo): string {
        return buildPolygonSvg(geo.cx, geo.cy, geo.rx, geo.ry, geo.sides, geo.cornerRadius, geo.cornerStyle);
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    protected computeBounds(geo: PolygonGeo) {
        return { left: geo.cx - geo.rx, top: geo.cy - geo.ry, right: geo.cx + geo.rx, bottom: geo.cy + geo.ry };
    }
}
