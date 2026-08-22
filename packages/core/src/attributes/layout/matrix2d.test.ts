import { describe, it, expect } from 'vitest';
import {
    identity, translation, multiply, applyToPoint, invert, cameraMatrix, nodeLocalMatrix,
    nodeProjectedMatrix, hasProjection3D, isProjective, facesAway, NO_PROJECTION_3D,
    type Matrix2D, type Projection3D,
} from '@/attributes/layout/matrix2d';

function closeTo(a: number, b: number, eps = 1e-9): void {
    expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
}

describe('matrix2d', () => {
    it('identity maps a point to itself', () => {
        const p = applyToPoint(identity(), { x: 7, y: -3 });
        expect(p).toEqual({ x: 7, y: -3 });
    });

    it('translation offsets a point', () => {
        const p = applyToPoint(translation(10, 20), { x: 1, y: 2 });
        expect(p).toEqual({ x: 11, y: 22 });
    });

    it('multiply applies the right matrix first (m1 · m2)', () => {
        // Scale-by-2 then translate-by-(5,0): translate is the outer (m1).
        const scale2 = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
        const m = multiply(translation(5, 0), scale2);
        const p = applyToPoint(m, { x: 3, y: 0 });
        closeTo(p.x, 11); // 3*2 + 5
    });

    it('nodeLocalMatrix with no rotation/scale is a pure translation to the origin', () => {
        const m = nodeLocalMatrix(40, 60, 0, 1, 0, 0);
        const p = applyToPoint(m, { x: 0, y: 0 });
        expect(p).toEqual({ x: 40, y: 60 });
    });

    it('nodeLocalMatrix rotates clockwise in canvas (y-down) space', () => {
        // 90° clockwise about the origin maps +x → +y (downward in canvas).
        const m = nodeLocalMatrix(0, 0, 90, 1, 0, 0);
        const p = applyToPoint(m, { x: 10, y: 0 });
        closeTo(p.x, 0);
        closeTo(p.y, 10);
    });

    it('nodeLocalMatrix rotates about the pivot, not the origin', () => {
        // Pivot at (10, 0): rotating 180° about it leaves a point on the far side.
        const m = nodeLocalMatrix(0, 0, 180, 1, 10, 0);
        const p = applyToPoint(m, { x: 10, y: 0 }); // the pivot itself is fixed
        closeTo(p.x, 10);
        closeTo(p.y, 0);
        const q = applyToPoint(m, { x: 20, y: 0 }); // 10 past the pivot → 10 before it
        closeTo(q.x, 0);
        closeTo(q.y, 0);
    });
});

describe('matrix2d – invert', () => {
    it('round-trips a point through a node transform', () => {
        // Every ingredient at once: offset centre, rotation, scale, pivot.
        const m = nodeLocalMatrix(40, -25, 37, 2.5, 12, -8);
        const p = { x: 13, y: -4 };
        const back = applyToPoint(invert(m)!, applyToPoint(m, p));
        closeTo(back.x, p.x);
        closeTo(back.y, p.y);
    });

    it('composes with its source to the identity', () => {
        const m = nodeLocalMatrix(5, 5, 20, 3, 0, 0);
        const composed = multiply(m, invert(m)!);
        closeTo(composed.a, 1);
        closeTo(composed.b, 0);
        closeTo(composed.c, 0);
        closeTo(composed.d, 1);
        closeTo(composed.e, 0);
        closeTo(composed.f, 0);
    });

    it('returns null at zero scale — the plane has collapsed', () => {
        expect(invert(nodeLocalMatrix(10, 10, 45, 0, 0, 0))).toBeNull();
    });
});

describe('matrix2d – cameraMatrix', () => {
    it('is the identity for a camera at rest on a viewport at the origin', () => {
        const m = cameraMatrix(0, 0, { x: 0, y: 0 }, 1, 0);
        closeTo(m.a, 1);
        closeTo(m.b, 0);
        closeTo(m.c, 0);
        closeTo(m.d, 1);
        closeTo(m.e, 0);
        closeTo(m.f, 0);
    });

    it('scales about the viewport centre when zoomed', () => {
        // zoom 2, origin at the world centre: a world point 100 to the right of
        // centre lands 200 to the right on screen.
        const p = applyToPoint(cameraMatrix(0, 0, { x: 0, y: 0 }, 2, 0), { x: 100, y: 0 });
        closeTo(p.x, 200);
        closeTo(p.y, 0);
    });

    it('centres on `origin`, whose y is y-up while the matrix is y-down', () => {
        // Origin at world (30, 40) y-up ⇒ canvas (30, -40): that point maps to
        // the viewport centre.
        const p = applyToPoint(cameraMatrix(0, 0, { x: 30, y: 40 }, 1, 0), { x: 30, y: -40 });
        closeTo(p.x, 0);
        closeTo(p.y, 0);
    });

    it('rotates by -heading, matching RenderContext.beginCamera', () => {
        // canvas.rotate(-90) maps +x → -y (upward in canvas space).
        const p = applyToPoint(cameraMatrix(0, 0, { x: 0, y: 0 }, 1, 90), { x: 10, y: 0 });
        closeTo(p.x, 0);
        closeTo(p.y, -10);
    });
});

describe('matrix2d – nodeProjectedMatrix', () => {
    /** The out-of-plane fields at rest, with `over` applied on top. */
    const p3 = (over: Partial<Projection3D> = {}): Projection3D => ({ ...NO_PROJECTION_3D, ...over });

    it('is exactly nodeLocalMatrix when nothing is out of plane', () => {
        const args = [40, -25, 37, 2.5, 12, -8] as const;
        expect(nodeProjectedMatrix(...args, p3())).toEqual(nodeLocalMatrix(...args));
    });

    it('leaves `depth` inert without a perspective — a parallel projection has no viewpoint', () => {
        const args = [0, 0, 0, 1, 0, 0] as const;
        expect(nodeProjectedMatrix(...args, p3({ depth: 500 }))).toEqual(nodeLocalMatrix(...args));
        expect(hasProjection3D(p3({ depth: 500 }))).toBe(false);
    });

    it('mirrors across the vertical centre line for flipHorizontal', () => {
        const m = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ flipHorizontal: true }));
        const p = applyToPoint(m, { x: 10, y: 4 });
        closeTo(p.x, -10);
        closeTo(p.y, 4); // the other axis is untouched
        expect(isProjective(m)).toBe(false); // a mirror is still affine
    });

    it('mirrors across the horizontal centre line for flipVertical', () => {
        const p = applyToPoint(nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ flipVertical: true })), { x: 10, y: 4 });
        closeTo(p.x, 10);
        closeTo(p.y, -4);
    });

    it('mirrors about the node centre, not the pivot — a flip cannot move a node', () => {
        // Pivot 10 to the right, which everything *else* here turns about. The
        // mirror does not: the node's centre is what stays fixed, so a point 5
        // to its right lands 5 to its left and the node itself has not moved.
        // See `nodeProjectedMatrix` for why a flip is deliberately the exception.
        const m = nodeProjectedMatrix(0, 0, 0, 1, 10, 0, p3({ flipHorizontal: true }));
        closeTo(applyToPoint(m, { x: 0, y: 0 }).x, 0);
        closeTo(applyToPoint(m, { x: 5, y: 0 }).x, -5);
    });

    it('leaves the translation alone under either mirror, at any pivot', () => {
        const plain = nodeProjectedMatrix(120, -40, 25, 1.4, 18, -9, p3());
        for (const mirror of [{ flipHorizontal: true }, { flipVertical: true }, { flipHorizontal: true, flipVertical: true }]) {
            const m = nodeProjectedMatrix(120, -40, 25, 1.4, 18, -9, p3(mirror));
            closeTo(m.e, plain.e);
            closeTo(m.f, plain.f);
        }
    });

    it('squashes a tilted node evenly with no perspective, and unevenly with it', () => {
        const tilt = p3({ rotationY: 60 });
        const flat = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, tilt);
        // rotateY(60) foreshortens x by cos 60 = ½ and leaves y alone.
        closeTo(applyToPoint(flat, { x: 100, y: 0 }).x, 50);
        closeTo(applyToPoint(flat, { x: -100, y: 0 }).x, -50);
        expect(isProjective(flat)).toBe(false);

        // With a viewpoint, the receding edge is the one that shrinks: the far
        // corner comes in further than the near one goes out.
        const deep = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ rotationY: 60, perspective: 400 }));
        expect(isProjective(deep)).toBe(true);
        const right = applyToPoint(deep, { x: 100, y: 0 }).x;   // swings away
        const left = applyToPoint(deep, { x: -100, y: 0 }).x;   // swings toward
        expect(right).toBeLessThan(50);
        expect(-left).toBeGreaterThan(50);
    });

    it('scales the whole node when depth moves it under a perspective', () => {
        const near = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ depth: 200, perspective: 800 }));
        // w = 1 - 200/800 = ¾, so everything projects 4/3 larger.
        closeTo(applyToPoint(near, { x: 30, y: 60 }).x, 40);
        closeTo(applyToPoint(near, { x: 30, y: 60 }).y, 80);

        const far = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ depth: -800, perspective: 800 }));
        closeTo(applyToPoint(far, { x: 30, y: 60 }).x, 15);
    });

    it('holds the pivot fixed however the node is tilted', () => {
        const m = nodeProjectedMatrix(120, -40, 25, 1.4, 18, -9, p3({ rotationX: 35, rotationY: -20, depth: 60, perspective: 700 }));
        const p = applyToPoint(m, { x: 18, y: -9 });
        closeTo(p.x, 120 + 18, 1e-9);
        closeTo(p.y, -40 - 9, 1e-9);
    });

    it('composes its own Z rotation with the node rotation, without touching it', () => {
        // Two independent numbers about one axis, so they add — and 30/0 has to
        // come out identical to 0/30, or one of them is secretly the other.
        const asNodeRotation = nodeProjectedMatrix(0, 0, 30, 1, 0, 0, p3({ rotationY: 20 }));
        const asBlockRotation = nodeProjectedMatrix(0, 0, 0, 1, 0, 0, p3({ rotationY: 20, rotationZ: 30 }));
        expect(asBlockRotation.a).toBeCloseTo(asNodeRotation.a, 10);
        expect(asBlockRotation.b).toBeCloseTo(asNodeRotation.b, 10);
        expect(asBlockRotation.c).toBeCloseTo(asNodeRotation.c, 10);
        expect(asBlockRotation.d).toBeCloseTo(asNodeRotation.d, 10);

        const both = nodeProjectedMatrix(0, 0, 12, 1, 0, 0, p3({ rotationZ: 18 }));
        const summed = nodeProjectedMatrix(0, 0, 30, 1, 0, 0, p3());
        expect(both.a).toBeCloseTo(summed.a, 10);
        expect(both.b).toBeCloseTo(summed.b, 10);
    });
});

describe('matrix2d – projective compose and invert', () => {
    const tilted = (): Matrix2D =>
        nodeProjectedMatrix(40, -25, 37, 1.6, 12, -8, {
            ...NO_PROJECTION_3D, rotationX: 28, rotationY: -41, depth: 90, perspective: 650,
        });

    it('round-trips a point through a tilted node transform', () => {
        const m = tilted();
        const p = { x: 13, y: -4 };
        const back = applyToPoint(invert(m)!, applyToPoint(m, p));
        closeTo(back.x, p.x, 1e-8);
        closeTo(back.y, p.y, 1e-8);
    });

    it('composes an affine parent with a projective child and still round-trips', () => {
        // What worldMatrix does every frame: the ancestor chain is affine, the
        // node itself is not, and picking inverts the product.
        const world = multiply(nodeLocalMatrix(200, 100, 15, 0.8, 0, 0), tilted());
        expect(isProjective(world)).toBe(true);
        const p = { x: -30, y: 22 };
        const back = applyToPoint(invert(world)!, applyToPoint(world, p));
        closeTo(back.x, p.x, 1e-7);
        closeTo(back.y, p.y, 1e-7);
    });

    it('keeps two affine matrices on the six-number path', () => {
        const m = multiply(nodeLocalMatrix(1, 2, 3, 4, 5, 6), nodeLocalMatrix(7, 8, 9, 1, 2, 3));
        expect(m.g).toBeUndefined();
        expect(m.h).toBeUndefined();
        expect(m.i).toBeUndefined();
    });

    it('composes with its own inverse to the identity', () => {
        const m = tilted();
        const composed = multiply(m, invert(m)!);
        // Homogeneous, so normalise by i before comparing.
        const k = composed.i ?? 1;
        closeTo(composed.a / k, 1, 1e-8);
        closeTo(composed.b / k, 0, 1e-8);
        closeTo(composed.c / k, 0, 1e-8);
        closeTo(composed.d / k, 1, 1e-8);
        closeTo(composed.e / k, 0, 1e-7);
        closeTo(composed.f / k, 0, 1e-7);
    });
});

describe('matrix2d – facesAway', () => {
    it('is false while the plane still faces the viewer', () => {
        expect(facesAway(0, 0)).toBe(false);
        expect(facesAway(45, -30)).toBe(false);
        expect(facesAway(89, 0)).toBe(false);
    });

    it('is true once a tilt has carried the plane past edge-on', () => {
        expect(facesAway(0, 180)).toBe(true);
        expect(facesAway(120, 0)).toBe(true);
    });

    it('is false again when two tilts turn it back around', () => {
        expect(facesAway(180, 180)).toBe(false);
    });
});
