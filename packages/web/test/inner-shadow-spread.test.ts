import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit, Surface } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { resolveShadow, type ShadowResolved } from "@motion-script/core";
// Relative imports: the browser harness has no vite-tsconfig-paths plugin.
import { getCanvasKit } from "../src/getter";
import { RectShape } from "../src/shapes/rect";
import { StrokeHandler } from "../src/stroke/stroke-handler";
import { FillHandler } from "../src/fills/handler";

let ck: CanvasKit;

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

// Render a 200×200 rect (filled white) centred at the surface middle, with the
// given inner shadow, into a raster surface. Returns a pixel sampler in surface
// space. The rect spans [40,40]–[160,160] on a 200×200 surface.
function renderInnerShadow(shadow: ShadowResolved) {
    const W = 200, H = 200;
    const surface = ck.MakeSurface(W, H) as Surface;
    const canvas = surface.getCanvas();
    canvas.clear(ck.TRANSPARENT);

    const paint = new ck.Paint();
    const getCanvas = () => canvas;
    const getPaint = () => paint;

    // Solid fills never touch `assets`, so a stub is fine here.
    const fills = new FillHandler(
        ck, getPaint, getCanvas,
        () => null, () => null,
        {} as never, () => 1,
    );
    const strokes = new StrokeHandler(ck, getCanvas, getPaint, fills);

    // White rect fill so any non-white interior pixel is shadow.
    const rect = new RectShape(ck, getCanvas, { x: 100, y: 100, width: 120, height: 120 });
    rect.ensurePath();
    const shape = rect.toCurrentShape(true);

    paint.setStyle(ck.PaintStyle.Fill);
    paint.setColor(ck.WHITE);
    shape.draw(paint);

    const whiteResolved = resolveShadow({ blur: 0, fill: "white" }).fill;
    strokes.applyInnerShadows([shadow], [shape], whiteResolved);

    surface.flush();

    const pixels = canvas.readPixels(0, 0, {
        width: W, height: H,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB,
    }) as Uint8Array;

    const at = (x: number, y: number) => {
        const i = (y * W + x) * 4;
        return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    };

    surface.delete();
    paint.delete();
    rect.deletePaths();
    return at;
}

// A black inner shadow paints a pixel toward black; "shadowed" means clearly not
// the white fill.
const isShadowed = ([r, g, b, a]: number[]) => a > 200 && r < 120 && g < 120 && b < 120;

describe("inner shadow spread (rendered)", () => {
    it("a large positive spread fills the interior shadow right up to the edge", () => {
        // spread 80 on a 120px-half-size rect: contour shrinks well past collapse,
        // so the whole interior should be shadowed — including the top-left corner
        // that previously fell outside the region's padded rect.
        const shadow = resolveShadow({ blur: 6, fill: "black", spread: 80, dx: 0, dy: 0, inner: true });
        const at = renderInnerShadow(shadow);

        // Just inside the top-left edge (rect starts at 40,40).
        expect(isShadowed(at(46, 46))).toBe(true);
        // And the centre.
        expect(isShadowed(at(100, 100))).toBe(true);
        // Just inside the bottom-right edge.
        expect(isShadowed(at(154, 154))).toBe(true);
    });

    it("a modest spread shadows the rim but leaves the centre as fill", () => {
        const shadow = resolveShadow({ blur: 4, fill: "black", spread: 12, dx: 0, dy: 0, inner: true });
        const at = renderInnerShadow(shadow);

        // Rim is shadowed on all four sides.
        expect(isShadowed(at(46, 100))).toBe(true);  // left
        expect(isShadowed(at(154, 100))).toBe(true); // right
        expect(isShadowed(at(100, 46))).toBe(true);  // top
        expect(isShadowed(at(100, 154))).toBe(true); // bottom
        // Centre stays the white fill.
        expect(isShadowed(at(100, 100))).toBe(false);
    });
});
