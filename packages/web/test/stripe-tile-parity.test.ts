import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { getCanvasKit } from "../src/getter";

/**
 * TEMPORARY — delete once the stripe rewrite has landed and been e2e'd.
 *
 * `fills/stripe.ts` used to bake its tile on a 2D canvas and read it back with
 * `getImageData`; it now draws on a Skia raster surface instead, which is what
 * lets the renderer layer move to `@motion-script/skia-render` without dragging
 * a DOM-canvas dependency along. That is supposed to be a pure refactor.
 *
 * This is the only test that can prove it, and only while *both* paths still
 * exist: it bakes the tile each way inside the same headless Chromium and
 * compares bytes. The e2e pixel diff would also catch a regression, but only for
 * whatever stripe styles the e2e scenes happen to use — this sweeps the
 * parameter space that actually matters (gap, stroke width, translucency).
 *
 * The subtle part is alpha. `getImageData` returns **unpremultiplied** RGBA
 * (the 2D canvas is premultiplied internally and the browser un-premultiplies
 * on read), and `MakeImage` is told `Unpremul`. `MakeSurface` happens to give an
 * Unpremul RGBA_8888/sRGB CPU surface, so reading it back as Unpremul keeps both
 * halves in the same space. Reading premultiplied instead would shift every
 * partially-covered antialiased pixel — a visibly softer or harder edge on every
 * stripe, which is exactly the failure this test is here to catch.
 */

/** The replaced implementation: bake the tile through a DOM 2D canvas. */
function bakeVia2DCanvas(
    ck: CanvasKit,
    gap: number,
    sw: number,
    color: [number, number, number, number],
): Uint8Array {
    const [cr, cg, cb, ca] = color;
    const cssColor = `rgba(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)},${ca})`;

    const canvas = document.createElement("canvas");
    canvas.width = gap;
    canvas.height = gap;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");

    ctx.clearRect(0, 0, gap, gap);
    ctx.strokeStyle = cssColor;
    ctx.lineWidth = sw;

    const offset = sw / 2;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset, gap);
    ctx.stroke();

    return new Uint8Array(ctx.getImageData(0, 0, gap, gap).data);
}

/** The new implementation: bake the tile on a Skia raster surface. */
function bakeViaSkia(
    ck: CanvasKit,
    gap: number,
    sw: number,
    color: [number, number, number, number],
): Uint8Array {
    const [cr, cg, cb, ca] = color;
    const surface = ck.MakeSurface(gap, gap);
    if (!surface) throw new Error("MakeSurface returned null");
    const paint = new ck.Paint();
    try {
        const canvas = surface.getCanvas();
        canvas.clear(ck.TRANSPARENT);
        paint.setAntiAlias(true);
        paint.setStyle(ck.PaintStyle.Stroke);
        paint.setStrokeWidth(sw);
        paint.setColor(ck.Color(
            Math.round(cr * 255), Math.round(cg * 255), Math.round(cb * 255), ca,
        ));
        const offset = sw / 2;
        canvas.drawLine(offset, 0, offset, gap, paint);
        surface.flush();

        const snapshot = surface.makeImageSnapshot();
        const pixels = snapshot?.readPixels(0, 0, {
            width: gap,
            height: gap,
            alphaType: ck.AlphaType.Unpremul,
            colorType: ck.ColorType.RGBA_8888,
            colorSpace: ck.ColorSpace.SRGB,
        }) as Uint8Array | null;
        snapshot?.delete();
        if (!pixels) throw new Error("readPixels returned null");
        return new Uint8Array(pixels);
    } finally {
        paint.delete();
        surface.delete();
    }
}

/** Largest absolute per-channel difference, and where it occurred. */
function maxDelta(a: Uint8Array, b: Uint8Array): { delta: number; at: number } {
    let delta = 0;
    let at = -1;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > delta) { delta = d; at = i; }
    }
    return { delta, at };
}

let ck: CanvasKit;

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

describe("stripe tile: Skia raster vs the 2D canvas it replaced", () => {
    const GAPS = [4, 8, 16];
    const WIDTHS = [1, 2, 3];
    const COLORS: Array<[string, [number, number, number, number]]> = [
        ["opaque black", [0, 0, 0, 1]],
        ["opaque colour", [0.2, 0.6, 0.9, 1]],
        ["translucent colour", [0.9, 0.3, 0.1, 0.5]],
    ];

    for (const gap of GAPS) {
        for (const sw of WIDTHS) {
            for (const [label, color] of COLORS) {
                it(`matches for gap=${gap} strokeWidth=${sw} ${label}`, () => {
                    const viaCanvas = bakeVia2DCanvas(ck, gap, sw, color);
                    const viaSkia = bakeViaSkia(ck, gap, sw, color);

                    expect(viaSkia.length).toBe(viaCanvas.length);
                    expect(viaSkia.length).toBe(4 * gap * gap);

                    // 1 allows for a single quantization step; anything larger is a
                    // real difference in coverage or colour space, not rounding.
                    const { delta, at } = maxDelta(viaCanvas, viaSkia);
                    expect(
                        delta,
                        `max per-channel delta ${delta} at byte ${at} ` +
                        `(pixel ${Math.floor(at / 4)}, channel ${"RGBA"[at % 4]}); ` +
                        `canvas=${viaCanvas[at]} skia=${viaSkia[at]}`,
                    ).toBeLessThanOrEqual(1);
                });
            }
        }
    }

    it("produces a fully transparent tile where no line was drawn", () => {
        // Guards the clear(): a non-zeroed surface would show up as stray ink in
        // the right-hand columns, which tile into visible seams.
        const gap = 16;
        const viaSkia = bakeViaSkia(ck, gap, 1, [0, 0, 0, 1]);
        // Rightmost column is far from the line at x=0.5.
        for (let y = 0; y < gap; y++) {
            const alpha = viaSkia[(y * gap + (gap - 1)) * 4 + 3];
            expect(alpha).toBe(0);
        }
    });
});
