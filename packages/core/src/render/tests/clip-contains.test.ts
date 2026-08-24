import { describe, it, expect } from 'vitest';
import { Clip } from '@/render/clip';
import { containsClip } from '@/render/clip-contains';

/**
 * `containsClip` is what makes hit testing follow a shape's real silhouette
 * rather than its bounding box — and it does so by reading the very `Clip` each
 * shape already declares for clipping, so the grab region and the drawn edge
 * cannot drift apart. These tests pin the primitives it derives.
 *
 * Every coordinate here is y-up author space, the space `Clip` descriptors are
 * written in.
 */

const at = (x: number, y: number) => ({ x, y });

describe('containsClip – rect', () => {
    const box = new Clip().rect({ width: 200, height: 100 });

    it('hits inside and misses outside', () => {
        expect(containsClip(box, at(0, 0))).toBe(true);
        expect(containsClip(box, at(99, 49))).toBe(true);      // just inside a corner
        expect(containsClip(box, at(101, 0))).toBe(false);
        expect(containsClip(box, at(0, 51))).toBe(false);
    });

    it('excludes the corner once it is rounded', () => {
        const rounded = new Clip().rect({ width: 200, height: 100, cornerRadius: 40 });
        // The bare box corner is outside the corner arc…
        expect(containsClip(rounded, at(99, 49))).toBe(false);
        // …while the straight edges beside it are still inside.
        expect(containsClip(rounded, at(0, 49))).toBe(true);
        expect(containsClip(rounded, at(99, 0))).toBe(true);
    });

    it('honours the shape descriptor position', () => {
        const offset = new Clip().rect({ x: 500, y: -200, width: 20, height: 20 });
        expect(containsClip(offset, at(500, -200))).toBe(true);
        expect(containsClip(offset, at(0, 0))).toBe(false);
    });

    it('undoes the shape rotation before testing', () => {
        // A 20-wide, 200-tall bar rotated 90° covers the horizontal axis instead.
        const bar = new Clip().rect({ width: 20, height: 200, rotation: 90 });
        expect(containsClip(bar, at(80, 0))).toBe(true);
        expect(containsClip(bar, at(0, 80))).toBe(false);
    });
});

describe('containsClip – ellipse', () => {
    const disk = new Clip().ellipse({ width: 200, height: 100 });

    it('hits at the centre and misses at the box corner', () => {
        expect(containsClip(disk, at(0, 0))).toBe(true);
        expect(containsClip(disk, at(99, 49))).toBe(false);   // inside the box, outside the ellipse
        expect(containsClip(disk, at(99, 0))).toBe(true);
    });

    it('a full ellipse is solid at the default ratio', () => {
        // Ellipse's default ratio is 1, which for a full sweep is the solid disk
        // (the bare-curve degeneracy exists only for a partial arc).
        expect(containsClip(new Clip().ellipse({ width: 100, height: 100, ratio: 1 }), at(0, 0))).toBe(true);
    });

    it('ratio between 0 and 1 punches a hole', () => {
        const donut = new Clip().ellipse({ width: 200, height: 200, ratio: 0.5 });
        expect(containsClip(donut, at(0, 0))).toBe(false);    // in the hole
        expect(containsClip(donut, at(75, 0))).toBe(true);    // in the band
        expect(containsClip(donut, at(150, 0))).toBe(false);  // outside
    });

    it('a partial sweep bounds a wedge', () => {
        // Quarter wedge from 0°, counter-clockwise in y-up author space.
        const wedge = new Clip().ellipse({ width: 200, height: 200, ratio: 0, sweep: 90, startAngle: 0 });
        expect(containsClip(wedge, at(50, 50))).toBe(true);   // inside the quadrant
        expect(containsClip(wedge, at(-50, 50))).toBe(false); // the next quadrant over
        expect(containsClip(wedge, at(50, -50))).toBe(false);
    });
});

describe('containsClip – polygon vs polygram', () => {
    // Same box, same vertex count: the difference is entirely the star's notches.
    const hexagon = new Clip().polygon({ width: 200, height: 200, sides: 6 });
    const star = new Clip().polygram({ width: 200, height: 200, sides: 6, ratio: 0.4 });

    it('both contain their centre', () => {
        expect(containsClip(hexagon, at(0, 0))).toBe(true);
        expect(containsClip(star, at(0, 0))).toBe(true);
    });

    it('a point in a star\'s concave notch misses, while the polygon hits it', () => {
        // Both shapes start at the top vertex, so the star's spikes sit at 90°,
        // 30°, … and its notches halfway between. This point is at 60° — the
        // notch direction — at radius 70: past the notch's own radius (40) but
        // well inside the hexagon's apothem (~87). This is the case that
        // justifies deriving the hit region from clipSelf() at all.
        const p = at(70 * Math.cos(Math.PI / 3), 70 * Math.sin(Math.PI / 3));
        expect(containsClip(hexagon, p)).toBe(true);
        expect(containsClip(star, p)).toBe(false);
    });

    it('a star spike hits out to the full radius', () => {
        expect(containsClip(star, at(0, 90))).toBe(true);    // on the top spike
        expect(containsClip(star, at(0, 30))).toBe(true);    // inside the inner ring
    });

    it('misses outside the circumscribed box', () => {
        expect(containsClip(hexagon, at(0, 130))).toBe(false);
        expect(containsClip(star, at(130, 0))).toBe(false);
    });
});

describe('containsClip – tolerance', () => {
    it('widens a rect outward', () => {
        const box = new Clip().rect({ width: 100, height: 100 });
        expect(containsClip(box, at(54, 0))).toBe(false);
        expect(containsClip(box, at(54, 0), 5)).toBe(true);
        expect(containsClip(box, at(56, 0), 5)).toBe(false);
    });

    it('widens an ellipse outward', () => {
        const disk = new Clip().ellipse({ width: 100, height: 100 });
        expect(containsClip(disk, at(52, 0))).toBe(false);
        expect(containsClip(disk, at(52, 0), 5)).toBe(true);
    });

    it('makes a polygon edge reachable from just outside', () => {
        // Apex at the top (0, 50); the flat bottom edge sits at y = -25.
        const tri = new Clip().polygon({ width: 100, height: 100, sides: 3 });
        const justOutside = at(0, -28);
        expect(containsClip(tri, justOutside)).toBe(false);
        expect(containsClip(tri, justOutside, 5)).toBe(true);
    });
});

describe('containsClip – compositing', () => {
    it('unions successive shapes', () => {
        const pair = new Clip()
            .rect({ x: -100, width: 50, height: 50 })
            .rect({ x: 100, width: 50, height: 50 });
        expect(containsClip(pair, at(-100, 0))).toBe(true);
        expect(containsClip(pair, at(100, 0))).toBe(true);
        expect(containsClip(pair, at(0, 0))).toBe(false);
    });

    it('cut() subtracts the shape declared before it', () => {
        const holed = new Clip()
            .rect({ width: 200, height: 200 })
            .ellipse({ width: 80, height: 80 })
            .cut();
        expect(containsClip(holed, at(80, 80))).toBe(true);   // the plate
        expect(containsClip(holed, at(0, 0))).toBe(false);    // the punched hole
    });

    it('an empty clip contains nothing', () => {
        expect(containsClip(new Clip(), at(0, 0))).toBe(false);
    });
});

describe('containsClip – line and path', () => {
    it('a line op hits along its segments', () => {
        const stroke = new Clip().line({ points: [at(-100, 0), at(100, 0)] });
        expect(containsClip(stroke, at(0, 0), 4)).toBe(true);
        expect(containsClip(stroke, at(0, 20), 4)).toBe(false);
        expect(containsClip(stroke, at(200, 0), 4)).toBe(false);
    });

    it('a path op falls back to its declared box', () => {
        // No built-in shape emits a `path` clip; a hand-built one degrades to the
        // bounding box rather than carrying a Bézier winding test.
        const p = new Clip().path({ width: 100, height: 60 });
        expect(containsClip(p, at(40, 20))).toBe(true);
        expect(containsClip(p, at(60, 0))).toBe(false);
    });
});
