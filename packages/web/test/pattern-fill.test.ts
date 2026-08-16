import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Fills, Rect, type Fill } from "@motion-script/core";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { createStillRenderer, type StillRenderer } from "../src/still";

/**
 * The two shader-drawn lattice fills — `grid` and `dotGrid` — against real
 * CanvasKit.
 *
 * They need a browser for the same reason the custom shader fill does: an SkSL
 * program that fails to compile paints *nothing*, and one whose geometry is off
 * by a factor paints something that still looks plausible on its own. Both fail
 * silently, and only pixels tell them apart.
 *
 * What is pinned here:
 *
 * 1. **The programs compile and the geometry lands.** A grid's cell pitch is the
 *    shape's size over its division count while a dot lattice's is its spacing in
 *    px — two different spaces, which is the whole distinction between the fills.
 * 2. **The uniforms line up.** `makeShader` takes a flat, padding-free array, and
 *    Skia lays the declarations out with alignment — so a `vec4` after an odd
 *    number of floats starts at the next 4-float boundary and every value after
 *    the gap reads garbage. For a coverage shader that renders as a solid block,
 *    which is exactly what these fills did before the declarations were ordered
 *    widest-first. A mid-cell pixel is the assertion that catches it.
 * 3. **Minor lines are thinner than major ones.** That ratio is the only thing
 *    telling a division from a subdivision, so a shader that lost it would draw
 *    `divisions × subdivisions` identical lines.
 * 4. **Alpha, once.** `FillHandler` puts `opacity × worldAlpha` on the paint and
 *    Skia modulates a shader's output by the paint alpha, so a shader folding
 *    opacity in again renders at its *square* — the bug `fills/fractal-noise` had.
 *
 * The frame's ground is opaque, so "no ink here" is a colour question rather than
 * an alpha one — hence a red ink and channel predicates. Sampled by fraction of
 * the frame, so the assertions hold whatever device scale the renderer runs at.
 */

const VIEWPORT = { width: 64, height: 64 };
const RED: [number, number, number, number] = [1, 0, 0, 1];

let renderer: StillRenderer;

beforeAll(async () => {
    // `getCanvasKit` memoizes inside the renderer, so later creates are cheap.
    const warm = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
    warm.dispose();
});

afterEach(() => {
    renderer?.dispose();
});

/** Render a full-bleed rect with `fill` and return the frame's pixels. */
async function paint(fill: Fill): Promise<Snapshot> {
    renderer = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
    await renderer.render(() => new Rect({ width: "fill", height: "fill", fill }));
    return (renderer as any).renderContext.snapshotPixels();
}

type RGBA = [number, number, number, number];
type Snapshot = { pixels: Uint8Array; width: number; height: number };

/** The pixel at a fraction across the frame, as [r, g, b, a]. */
function at(snapshot: Snapshot, fx: number, fy: number): RGBA {
    const { pixels, width, height } = snapshot;
    const x = Math.min(width - 1, Math.floor(fx * width));
    const y = Math.min(height - 1, Math.floor(fy * height));
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}

/** A logical-px coordinate as the fraction of the frame `at` wants. */
const px = (logical: number) => logical / VIEWPORT.width;

const isInk = (p: RGBA) => p[0] > 200;
const isClear = (p: RGBA) => p[0] < 40;

describe("the grid fill", () => {
    it("rules the shape into the number of cells it was asked for", async () => {
        // 4 divisions across 64px: lines every 16px, i.e. at 16, 32 and 48.
        const frame = await paint(
            Fills.grid({ divisions: 4, strokeWidth: 2, color: RED }),
        );

        expect(isInk(at(frame, px(16), px(8)))).toBe(true);
        expect(isInk(at(frame, px(32), px(8)))).toBe(true);
        // Rows too — a grid that only ruled one axis would pass everything above.
        expect(isInk(at(frame, px(8), px(48)))).toBe(true);
        // Mid-cell, as far from a line as this grid gets.
        expect(isClear(at(frame, px(8), px(8)))).toBe(true);
    });

    it("defaults subdivision lines to half the width of division lines", async () => {
        // 2 divisions (pitch 32) split 2 ways (pitch 16), at a stroke wide enough
        // for the half-width ratio to be several pixels rather than one.
        const frame = await paint(
            Fills.grid({
                divisions: 2,
                subdivisions: 2,
                strokeWidth: 8,
                color: RED,
            }),
        );

        // Both orders draw a line where they fall...
        expect(isInk(at(frame, px(32), px(8)))).toBe(true);
        expect(isInk(at(frame, px(16), px(8)))).toBe(true);
        // ...but 3px out only the major one is still covered: half of 8, against
        // half of 8 × MINOR_WIDTH_RATIO.
        expect(isInk(at(frame, px(35), px(8)))).toBe(true);
        expect(isClear(at(frame, px(19), px(8)))).toBe(true);
    });

    it("takes an explicit weight for each order, and 0 to switch one off", async () => {
        // The ratio inverted: a fine coarse ruling with a *fat* mesh inside it,
        // which the default half-of-major could never produce.
        const inverted = await paint(
            Fills.grid({
                divisions: 2,
                subdivisions: 2,
                strokeWidth: 2,
                subdivisionWidth: 8,
                color: RED,
            }),
        );

        // 3px out from a subdivision line is now ink where the default ratio
        // left it clear — the previous test asserts exactly that point empty.
        expect(isInk(at(inverted, px(19), px(8)))).toBe(true);
        // Still a ruling and not a block: mid-cell is 7px from any line.
        expect(isClear(at(inverted, px(8), px(8)))).toBe(true);
        // The major lines are swallowed rather than lost — every one of them is
        // also a subdivision line, since the minor pitch divides the major one.
        expect(isInk(at(inverted, px(32), px(8)))).toBe(true);

        // A width of zero has to leave *nothing*, not a half-covered pixel: the
        // coverage ramp is centred on the line, so without the guard in the
        // shader an order switched off would still ghost.
        const majorOnly = await paint(
            Fills.grid({
                divisions: 2,
                subdivisions: 2,
                strokeWidth: 8,
                subdivisionWidth: 0,
                color: RED,
            }),
        );

        expect(isInk(at(majorOnly, px(32), px(8)))).toBe(true);
        expect(isClear(at(majorOnly, px(16), px(8)))).toBe(true);
    });

    it("slides the whole ruling by the offset", async () => {
        const frame = await paint(
            Fills.grid({
                divisions: 4,
                strokeWidth: 2,
                offset: { x: 8, y: 0 },
                color: RED,
            }),
        );

        expect(isInk(at(frame, px(24), px(8)))).toBe(true);
        expect(isClear(at(frame, px(16), px(8)))).toBe(true);
    });
});

describe("the dot grid fill", () => {
    it("places a dot in each cell of a pixel-pitched lattice", async () => {
        // 16px spacing puts the first dot's centre at 8, 8 — the middle of the
        // first cell — with a radius of 4 around it.
        const frame = await paint(
            Fills.dotGrid({ radius: 4, spacing: 16, color: RED }),
        );

        expect(isInk(at(frame, px(8), px(8)))).toBe(true);
        expect(isInk(at(frame, px(24), px(24)))).toBe(true);
        // The corner is more than a radius clear of the nearest dot.
        expect(isClear(at(frame, px(0), px(0)))).toBe(true);
    });

    it("slides the whole lattice by the offset", async () => {
        const frame = await paint(
            Fills.dotGrid({
                radius: 4,
                spacing: 16,
                offset: { x: 8, y: 0 },
                color: RED,
            }),
        );

        expect(isInk(at(frame, px(16), px(8)))).toBe(true);
        expect(isClear(at(frame, px(8), px(8)))).toBe(true);
    });

    it("applies the layer opacity once, not twice", async () => {
        const half = await paint(
            Fills.dotGrid({ radius: 4, spacing: 16, color: RED, opacity: 0.5 }),
        );

        // Half a red dot over the ground reads ~128; folded in twice it would
        // land near 64.
        const [red] = at(half, px(8), px(8));
        expect(red).toBeGreaterThan(110);
        expect(red).toBeLessThan(145);
    });
});
