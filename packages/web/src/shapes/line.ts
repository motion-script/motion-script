import { LineState, Vector2, withLineDescriptor } from "@motion-script/core";
import { BaseShape } from "./base";

type LineGeo = {
    points: Vector2[];
    radius: number;
    closed: boolean;
};

function buildLineSvg(points: Vector2[], radius: number, closed: boolean): string {
    if (points.length === 0) return "M 0 0";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    const r = Math.max(0, radius);
    const parts: string[] = [];
    const count = points.length;

    const getDir = (a: Vector2, b: Vector2) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return len > 0 ? { dx: dx / len, dy: dy / len, len } : { dx: 0, dy: 0, len: 0 };
    };

    if (r === 0) {
        parts.push(`M ${points[0].x} ${points[0].y}`);
        for (let i = 1; i < count; i++) {
            parts.push(`L ${points[i].x} ${points[i].y}`);
        }
    } else {
        const endIdx = closed ? count : count - 1;
        for (let i = 0; i <= endIdx; i++) {
            const prev = points[(i - 1 + count) % count];
            const curr = points[i % count];
            const next = points[(i + 1) % count];

            if (!closed && i === 0) {
                parts.push(`M ${curr.x} ${curr.y}`);
                continue;
            }
            if (!closed && i === count - 1) {
                parts.push(`L ${curr.x} ${curr.y}`);
                continue;
            }

            const dIn = getDir(prev, curr);
            const dOut = getDir(curr, next);
            const cutIn = Math.min(r, dIn.len / 2);
            const cutOut = Math.min(r, dOut.len / 2);

            const inX = curr.x - dIn.dx * cutIn;
            const inY = curr.y - dIn.dy * cutIn;
            const outX = curr.x + dOut.dx * cutOut;
            const outY = curr.y + dOut.dy * cutOut;

            if (i === 0 && closed) {
                parts.push(`M ${inX} ${inY}`);
            } else {
                parts.push(`L ${inX} ${inY}`);
            }
            parts.push(`Q ${curr.x} ${curr.y} ${outX} ${outY}`);
        }
    }

    if (closed) parts.push("Z");
    return parts.join(" ");
}

/**
 * Polyline (open or closed) through `points`, with corners optionally rounded
 * by cutting back along each adjacent edge and joining with a quadratic curve
 * (`radius` clamped to half the shorter adjacent edge to avoid overshoot).
 */
export class LineShape extends BaseShape<LineState, LineGeo> {
    protected resolveState(state: Partial<LineState>): LineState {
        return withLineDescriptor(state);
    }

    protected computeGeometry(): LineGeo {
        const { points, radius, closed } = this.fullState;
        return { points, radius, closed };
    }

    protected buildSVGPath(geo: LineGeo): string {
        return buildLineSvg(geo.points, geo.radius, geo.closed);
    }

    protected needsTrim(): boolean {
        return this.fullState.start !== 0 || this.fullState.end !== 1;
    }

    protected getTrimRange() {
        return { start: this.fullState.start, end: this.fullState.end };
    }

    // ensurePath() guards against empty points before attempting path creation
    override ensurePath(): void {
        if (this.fullState.points.length === 0) return;
        super.ensurePath();
    }
}
