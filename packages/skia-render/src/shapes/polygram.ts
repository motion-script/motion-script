import { CornerStyle, PolygramState, withPolygramDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";
import { cornerCommandsFromCut } from "./corner";

type PolygramGeo = {
    cx: number; cy: number;
    rx: number; ry: number;
    sides: number;
    ratio: number;
    cornerRadius: number;
    cornerStyle: CornerStyle;
};

function buildPolygramSvg(
    cx: number, cy: number,
    rx: number, ry: number,
    sides: number,
    ratio: number,
    cornerRadius: number,
    cornerStyle: CornerStyle,
): string {
    const totalPoints = sides * 2;
    const angleStep = Math.PI / sides;
    const startAngle = -Math.PI / 2;

    const verts: [number, number][] = [];
    for (let i = 0; i < totalPoints; i++) {
        const a = startAngle + i * angleStep;
        const isOuter = i % 2 === 0;
        const r = isOuter ? 1 : ratio;
        verts.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]);
    }

    if (cornerRadius <= 0) {
        const parts = verts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`);
        parts.push("Z");
        return parts.join(" ");
    }

    const parts: string[] = [];
    for (let i = 0; i < totalPoints; i++) {
        const curr = verts[i];
        const isOuter = i % 2 === 0;

        if (!isOuter) {
            parts.push(`${parts.length === 0 ? "M" : "L"} ${curr[0]} ${curr[1]}`);
            continue;
        }

        const prev = verts[(i - 1 + totalPoints) % totalPoints];
        const next = verts[(i + 1) % totalPoints];

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
 * Star polygon: alternates outer vertices (radius 1) and inner vertices
 * (radius `ratio`). Only outer (convex) vertices are rounded by `cornerRadius`;
 * inner vertices stay sharp, matching typical star-shape conventions.
 * `cornerStyle` switches the rounded vertices between a circular arc and a
 * straight chamfer.
 */
export class PolygramShape extends BaseShape<PolygramState, PolygramGeo> {
    protected resolveState(state: Partial<PolygramState>): PolygramState {
        return withPolygramDescriptor(state);
    }

    protected computeGeometry(): PolygramGeo {
        const s = this.fullState;
        return {
            cx: s.x, cy: s.y,
            rx: s.width / 2,
            ry: s.height / 2,
            sides: Math.max(3, Math.round(s.sides)),
            ratio: Math.max(0, Math.min(1, s.ratio)),
            cornerRadius: s.cornerRadius,
            cornerStyle: s.cornerStyle,
        };
    }

    protected buildSVGPath(geo: PolygramGeo): string {
        return buildPolygramSvg(geo.cx, geo.cy, geo.rx, geo.ry, geo.sides, geo.ratio, geo.cornerRadius, geo.cornerStyle);
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    protected computeBounds(geo: PolygramGeo) {
        return { left: geo.cx - geo.rx, top: geo.cy - geo.ry, right: geo.cx + geo.rx, bottom: geo.cy + geo.ry };
    }
}
