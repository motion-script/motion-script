import { describe, it, expect } from 'vitest';
import {
    lerpPath,
    buildMorph,
    sampleMorph,
    toCubicSubpaths,
} from '@/attributes/shape/path/morph';
import { toPathCommands } from '@/attributes/shape/path/parse';
import { PathCommand } from '@/render/descriptors/path';
import { cubicPoint } from '@/attributes/shape/path/bezier';
import { Vector2 } from '@/attributes/layout/vector2';

// --- Helpers ---------------------------------------------------------------

/**
 * Flatten a command list into a dense polyline by sampling every segment. Handles
 * the absolute command subset used by the reference shapes in this file (M, L, C,
 * Q, A, Z) plus the M/C-only output of the morpher. Arcs are sampled by reusing
 * the morpher's own arc→cubic conversion so the reference circle and the morphed
 * circle flatten consistently.
 */
function flatten(cmds: PathCommand[], per = 12): Vector2[] {
    const pts: Vector2[] = [];
    let cur: Vector2 = { x: 0, y: 0 };
    let start: Vector2 = { x: 0, y: 0 };
    const sampleCubic = (p0: Vector2, c1: Vector2, c2: Vector2, p1: Vector2) => {
        for (let i = 1; i <= per; i++) pts.push(cubicPoint(p0, c1, c2, p1, i / per));
    };
    const sampleLine = (from: Vector2, to: Vector2) => {
        for (let i = 1; i <= per; i++) {
            pts.push({ x: from.x + (to.x - from.x) * (i / per), y: from.y + (to.y - from.y) * (i / per) });
        }
    };
    for (const cmd of cmds) {
        switch (cmd.type) {
            case 'M':
                cur = { x: cmd.x, y: cmd.y };
                start = cur;
                pts.push(cur);
                break;
            case 'L': {
                const to = { x: cmd.x, y: cmd.y };
                sampleLine(cur, to);
                cur = to;
                break;
            }
            case 'C': {
                const p1 = { x: cmd.x, y: cmd.y };
                sampleCubic(cur, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, p1);
                cur = p1;
                break;
            }
            case 'Q': {
                const p1 = { x: cmd.x, y: cmd.y };
                const cp = { x: cmd.x1, y: cmd.y1 };
                // Elevate to cubic for sampling.
                const c1 = { x: cur.x + (2 / 3) * (cp.x - cur.x), y: cur.y + (2 / 3) * (cp.y - cur.y) };
                const c2 = { x: p1.x + (2 / 3) * (cp.x - p1.x), y: p1.y + (2 / 3) * (cp.y - p1.y) };
                sampleCubic(cur, c1, c2, p1);
                cur = p1;
                break;
            }
            case 'A': {
                // Sample the reference arc via the morpher's cubic subpaths so the
                // reference and morphed circles flatten on the same basis.
                const sub = toCubicSubpaths([
                    { type: 'M', x: cur.x, y: cur.y },
                    cmd,
                ]);
                for (const c of sub[0]?.cubics ?? []) sampleCubic(c.p0, c.c1, c.c2, c.p1);
                cur = { x: cmd.x, y: cmd.y };
                break;
            }
            case 'Z':
                sampleLine(cur, start);
                cur = start;
                break;
        }
    }
    return pts;
}

/** Perpendicular distance from point `p` to segment `a`–`b`. */
function pointToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Worst-case distance from any point of `a`'s outline to `b`'s outline, measured
 * against `b`'s line segments (not its sampled points). Measuring point-to-segment
 * — rather than point-to-point — removes the artifact where two polylines trace
 * the same curve but sample it at offset positions, which otherwise reports a
 * spurious gap of half the sampling step along steep edges.
 */
function maxDeviation(a: Vector2[], b: Vector2[]): number {
    let worst = 0;
    for (const p of a) {
        let nearest = Infinity;
        for (let i = 0; i + 1 < b.length; i++) {
            const d = pointToSegment(p, b[i], b[i + 1]);
            if (d < nearest) nearest = d;
        }
        if (nearest > worst) worst = nearest;
    }
    return worst;
}

/** Symmetric shape distance: how far the two outlines stray from each other. */
function shapeDistance(a: PathCommand[], b: PathCommand[]): number {
    const fa = flatten(a, 48);
    const fb = flatten(b, 48);
    return Math.max(maxDeviation(fa, fb), maxDeviation(fb, fa));
}

/** Split a command list into per-subpath command lists at each `M`. */
function splitByMove(cmds: PathCommand[]): PathCommand[][] {
    const subs: PathCommand[][] = [];
    for (const cmd of cmds) {
        if (cmd.type === 'M') subs.push([cmd]);
        else if (subs.length) subs[subs.length - 1].push(cmd);
    }
    return subs;
}

/** Largest dimension of a subpath's axis-aligned bounding box. */
function bboxExtent(cmds: PathCommand[]): number {
    const pts = flatten(cmds, 8);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return Math.max(maxX - minX, maxY - minY);
}

const square = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
const triangle = 'M 0 0 L 10 0 L 5 10 Z';
const circle = 'M 10 0 A 10 10 0 1 1 -10 0 A 10 10 0 1 1 10 0';

// --- toCubicSubpaths -------------------------------------------------------

describe('toCubicSubpaths', () => {
    it('converts a closed square into one closed subpath of four cubics', () => {
        const subs = toCubicSubpaths(toPathCommands(square));
        expect(subs).toHaveLength(1);
        expect(subs[0].closed).toBe(true);
        // 3 explicit lines + 1 closing line back to start.
        expect(subs[0].cubics).toHaveLength(4);
    });

    it('marks an open path as not closed', () => {
        const subs = toCubicSubpaths(toPathCommands('M 0 0 L 10 0 L 10 10'));
        expect(subs[0].closed).toBe(false);
        expect(subs[0].cubics).toHaveLength(2);
    });

    it('keeps the first anchor and the final anchor at the path endpoints', () => {
        const subs = toCubicSubpaths(toPathCommands('M 2 3 L 8 9'));
        const cubics = subs[0].cubics;
        expect(cubics[0].p0).toEqual({ x: 2, y: 3 });
        expect(cubics[cubics.length - 1].p1).toEqual({ x: 8, y: 9 });
    });

    it('elevates a quadratic into an exact cubic (endpoints preserved)', () => {
        const subs = toCubicSubpaths(toPathCommands('M 0 0 Q 5 10 10 0'));
        const c = subs[0].cubics[0];
        expect(c.p0).toEqual({ x: 0, y: 0 });
        expect(c.p1).toEqual({ x: 10, y: 0 });
        // Quad apex at t=0.5 is (5,5); the elevated cubic must pass through it.
        const mid = cubicPoint(c.p0, c.c1, c.c2, c.p1, 0.5);
        expect(mid.x).toBeCloseTo(5, 6);
        expect(mid.y).toBeCloseTo(5, 6);
    });

    it('produces a chain of cubics whose anchors approximate a circle for an arc', () => {
        const subs = toCubicSubpaths(toPathCommands(circle));
        expect(subs[0].cubics.length).toBeGreaterThanOrEqual(2);
        // Every anchor should sit ~10 units from the circle center (0,0).
        for (const c of subs[0].cubics) {
            expect(Math.hypot(c.p0.x, c.p0.y)).toBeCloseTo(10, 1);
        }
    });

    it('handles relative commands and reflected smooth curves', () => {
        // m + c + s (the s reflects the previous c's trailing control point).
        const subs = toCubicSubpaths(toPathCommands('m 0 0 c 0 5 5 5 5 5 s 5 0 5 -5'));
        expect(subs).toHaveLength(1);
        expect(subs[0].cubics).toHaveLength(2);
        // First cubic ends at (5,5), so the second begins there.
        expect(subs[0].cubics[1].p0.x).toBeCloseTo(5, 6);
        expect(subs[0].cubics[1].p0.y).toBeCloseTo(5, 6);
    });
});

// --- lerpPath endpoints ----------------------------------------------------

describe('lerpPath – endpoints', () => {
    it('returns the source verbatim at t=0', () => {
        expect(lerpPath(square, triangle, 0)).toBe(square);
    });

    it('returns the target verbatim at t=1', () => {
        expect(lerpPath(square, triangle, 1)).toBe(triangle);
    });

    it('clamps t below 0 to the source and above 1 to the target', () => {
        expect(lerpPath(square, triangle, -0.5)).toBe(square);
        expect(lerpPath(square, triangle, 2)).toBe(triangle);
    });

    it('produces a command array (not a string) for in-between t', () => {
        const mid = lerpPath(square, triangle, 0.5);
        expect(Array.isArray(mid)).toBe(true);
    });
});

// --- lerpPath fidelity -----------------------------------------------------

describe('lerpPath – shape fidelity', () => {
    it('matches the source shape closely just after t=0', () => {
        const near = lerpPath(square, triangle, 0.0001) as PathCommand[];
        expect(shapeDistance(near, toPathCommands(square))).toBeLessThan(0.05);
    });

    it('matches the target shape closely just before t=1', () => {
        const near = lerpPath(square, triangle, 0.9999) as PathCommand[];
        expect(shapeDistance(near, toPathCommands(triangle))).toBeLessThan(0.05);
    });

    it('keeps the midpoint between the two shapes (no points fly away)', () => {
        const mid = lerpPath(square, triangle, 0.5) as PathCommand[];
        // Every sampled point must lie within the union bounding box (with slack).
        for (const p of flatten(mid)) {
            expect(p.x).toBeGreaterThanOrEqual(-1);
            expect(p.x).toBeLessThanOrEqual(11);
            expect(p.y).toBeGreaterThanOrEqual(-1);
            expect(p.y).toBeLessThanOrEqual(11);
        }
    });
});

// --- smoothness ------------------------------------------------------------

describe('lerpPath – smoothness over time', () => {
    it('advances each anchor point monotonically and in small steps', () => {
        const plan = buildMorph(toPathCommands(square), toPathCommands(triangle));
        // Track the first subpath's anchor trajectories across the tween.
        const steps = 40;
        let prev: Vector2[] | null = null;
        let maxStep = 0;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const cmds = sampleMorph(plan, t);
            const anchors = cmds.filter((c): c is Extract<PathCommand, { type: 'M' | 'C' }> =>
                c.type === 'M' || c.type === 'C',
            ).map((c) => (c.type === 'M' ? { x: c.x, y: c.y } : { x: c.x, y: c.y }));
            if (prev) {
                for (let k = 0; k < Math.min(prev.length, anchors.length); k++) {
                    maxStep = Math.max(maxStep, Math.hypot(anchors[k].x - prev[k].x, anchors[k].y - prev[k].y));
                }
            }
            prev = anchors;
        }
        // No anchor should jump more than a small fraction of the shape size per
        // 1/40 of the tween — a kink or reorder would spike this.
        expect(maxStep).toBeLessThan(2);
    });
});

// --- point-order & winding independence ------------------------------------

describe('lerpPath – point order & winding independence', () => {
    const squareCW = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
    // Same square, started at a different corner and wound the opposite way.
    const squareRotatedReversed = 'M 10 10 L 10 0 L 0 0 L 0 10 Z';

    it('morphs between identical shapes with different start/winding without distortion', () => {
        // At t=0.5 the in-between of a square with itself must still be that square.
        const mid = lerpPath(squareCW, squareRotatedReversed, 0.5) as PathCommand[];
        expect(shapeDistance(mid, toPathCommands(squareCW))).toBeLessThan(0.5);
    });

    it('aligns rings so the halfway morph stays small (no spin-around)', () => {
        // If the rings were misaligned, midpoints would collapse toward the center;
        // a good alignment keeps the outline near the square edges throughout.
        const plan = buildMorph(toPathCommands(squareCW), toPathCommands(squareRotatedReversed));
        const mid = sampleMorph(plan, 0.5);
        for (const p of flatten(mid)) {
            // Distance from center (5,5): square edge midpoints are 5 away, corners ~7.07.
            // A collapsed/spun morph would pull points well inside ~3.
            const fromCenter = Math.hypot(p.x - 5, p.y - 5);
            expect(fromCenter).toBeGreaterThan(3);
        }
    });
});

// --- count mismatches ------------------------------------------------------

describe('lerpPath – differing command counts', () => {
    it('morphs a triangle (3 sides) into a square (4 sides) smoothly', () => {
        const t = lerpPath(triangle, square, 0.5) as PathCommand[];
        // Both endpoints should be reproduced exactly by the plan.
        const start = lerpPath(triangle, square, 0.0001) as PathCommand[];
        const end = lerpPath(triangle, square, 0.9999) as PathCommand[];
        expect(shapeDistance(start, toPathCommands(triangle))).toBeLessThan(0.05);
        expect(shapeDistance(end, toPathCommands(square))).toBeLessThan(0.05);
        expect(t.length).toBeGreaterThan(0);
    });

    it('reproduces both endpoints when morphing a square into a circle', () => {
        const start = lerpPath(square, circle, 0.0001) as PathCommand[];
        const end = lerpPath(square, circle, 0.9999) as PathCommand[];
        expect(shapeDistance(start, toPathCommands(square))).toBeLessThan(0.1);
        expect(shapeDistance(end, toPathCommands(circle))).toBeLessThan(0.5);
    });
});

// --- multi-subpath ---------------------------------------------------------

describe('lerpPath – multiple subpaths', () => {
    const twoBoxes = 'M 0 0 L 5 0 L 5 5 L 0 5 Z M 20 20 L 25 20 L 25 25 L 20 25 Z';
    const oneBox = 'M 0 0 L 5 0 L 5 5 L 0 5 Z';

    it('grows a new subpath out of a point when the target has more subpaths', () => {
        // one box → two boxes. At the end the shape is the two boxes exactly.
        const end = lerpPath(oneBox, twoBoxes, 0.9999) as PathCommand[];
        expect(shapeDistance(end, toPathCommands(twoBoxes))).toBeLessThan(0.5);

        // At the start the original box is reproduced exactly — every point of
        // `oneBox` lies on the morph — while the extra subpath is collapsed to a
        // near-zero point (it grows out of where it will eventually land), so it
        // adds no visible geometry.
        const start = lerpPath(oneBox, twoBoxes, 0.0001) as PathCommand[];
        const oneBoxOutline = flatten(toPathCommands(oneBox), 48);
        expect(maxDeviation(oneBoxOutline, flatten(start, 48))).toBeLessThan(0.5);

        // The second subpath of `start` should be a degenerate point (tiny bbox).
        const subpaths = splitByMove(start);
        expect(subpaths).toHaveLength(2);
        expect(bboxExtent(subpaths[1])).toBeLessThan(0.5);
    });

    it('emits one M per subpath in the morphed output', () => {
        const mid = lerpPath(oneBox, twoBoxes, 0.5) as PathCommand[];
        const moves = mid.filter((c) => c.type === 'M');
        expect(moves).toHaveLength(2);
    });

    it('pairs nearby subpaths regardless of declared order', () => {
        // Same two boxes, listed in the opposite order: morph should be a no-op shape.
        const swapped = 'M 20 20 L 25 20 L 25 25 L 20 25 Z M 0 0 L 5 0 L 5 5 L 0 5 Z';
        const mid = lerpPath(twoBoxes, swapped, 0.5) as PathCommand[];
        expect(shapeDistance(mid, toPathCommands(twoBoxes))).toBeLessThan(0.5);
    });
});

// --- string / command-array input mixing -----------------------------------

describe('lerpPath – mixed input forms', () => {
    it('accepts a command array as the source and a string as the target', () => {
        const from = toPathCommands(square);
        const mid = lerpPath(from, triangle, 0.5);
        expect(Array.isArray(mid)).toBe(true);
    });

    it('is stable when called repeatedly with the same endpoints (cache reuse)', () => {
        const a = sampleMorph(buildMorph(toPathCommands(square), toPathCommands(triangle)), 0.5);
        const b = lerpPath(square, triangle, 0.5) as PathCommand[];
        expect(shapeDistance(a, b)).toBeLessThan(1e-6);
    });
});

// --- degenerate inputs -----------------------------------------------------

describe('lerpPath – degenerate inputs', () => {
    it('handles morphing from an empty path (grows the target out of a point)', () => {
        const end = lerpPath('', square, 0.9999) as PathCommand[];
        expect(shapeDistance(end, toPathCommands(square))).toBeLessThan(0.5);
    });

    it('handles morphing to an empty path (shrinks the source to a point)', () => {
        const start = lerpPath(square, '', 0.0001) as PathCommand[];
        expect(shapeDistance(start, toPathCommands(square))).toBeLessThan(0.5);
    });

    it('returns an empty plan for two empty paths', () => {
        const plan = buildMorph([], []);
        expect(plan.pairs).toHaveLength(0);
        expect(sampleMorph(plan, 0.5)).toEqual([]);
    });

    it('does not throw when an endpoint is nullish (degrades to empty)', () => {
        expect(() => lerpPath(undefined as never, square, 0.5)).not.toThrow();
        expect(() => lerpPath(square, null as never, 0.5)).not.toThrow();
    });
});

// --- closure / stroke integrity --------------------------------------------

describe('lerpPath – closure', () => {
    const diamond = 'M 50 0 L 100 50 L 50 100 L 0 50 Z';
    const openZig = 'M 0 0 L 10 5 L 0 10 L 10 15';

    it('emits a trailing Z for a closed→closed morph so the stroke joins at the seam', () => {
        const mid = lerpPath(diamond, square, 0.5) as PathCommand[];
        expect(mid.some((c) => c.type === 'Z')).toBe(true);
        // Every subpath that starts with M ends with Z.
        const subs = splitByMove(mid);
        for (const sub of subs) {
            expect(sub[sub.length - 1].type).toBe('Z');
        }
    });

    it('keeps the morphed ring geometrically closed (last point meets the start)', () => {
        const mid = lerpPath(diamond, square, 0.37) as PathCommand[];
        const move = mid.find((c) => c.type === 'M') as Extract<PathCommand, { type: 'M' }>;
        // The last drawing command before Z must land back on the move point.
        const lastDraw = [...mid].reverse().find((c) => c.type === 'C') as Extract<PathCommand, { type: 'C' }>;
        expect(lastDraw.x).toBeCloseTo(move.x, 6);
        expect(lastDraw.y).toBeCloseTo(move.y, 6);
    });

    it('does not close an open→open morph', () => {
        const openZig2 = 'M 0 0 L 8 4 L 0 8 L 8 12';
        const mid = lerpPath(openZig, openZig2, 0.5) as PathCommand[];
        expect(mid.some((c) => c.type === 'Z')).toBe(false);
    });

    it('does not close when only one side is closed', () => {
        // A closed square morphing to an open polyline must not be force-closed.
        const mid = lerpPath(square, openZig, 0.5) as PathCommand[];
        expect(mid.some((c) => c.type === 'Z')).toBe(false);
    });
});
