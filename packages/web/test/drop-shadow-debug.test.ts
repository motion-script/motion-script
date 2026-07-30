import { describe, it, expect, beforeAll } from "vitest";
import type { CanvasKit, Surface } from "@motion-script/canvaskit";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { resolveShadow } from "@motion-script/core";
import { getCanvasKit } from "../src/getter";
import { RectShape } from "@motion-script/skia-render/shapes/rect";
import { StrokeHandler } from "../src/stroke/stroke-handler";
import { FillHandler } from "../src/fills/handler";

let ck: CanvasKit;

beforeAll(async () => {
    ck = await getCanvasKit(wasmUrl);
});

describe("debug drop shadow", () => {
    it("paints a white drop shadow offset from a blue rect", () => {
        const W = 200, H = 200;
        const surface = ck.MakeSurface(W, H) as Surface;
        const canvas = surface.getCanvas();
        canvas.clear(ck.BLACK);

        const paint = new ck.Paint();
        const getCanvas = () => canvas;
        const getPaint = () => paint;

        const fills = new FillHandler(
            ck, getPaint, getCanvas,
            () => null, () => null,
            {} as never, () => 1,
        );
        const strokes = new StrokeHandler(ck, getCanvas, getPaint, fills);

        const rect = new RectShape(ck, getCanvas, { x: 100, y: 100, width: 60, height: 60 });
        rect.ensurePath();
        const shape = rect.toCurrentShape(true);

        const shadow = resolveShadow({ blur: 20, spread: 2, fill: "white", offset: { x: 20, y: -20 } });
        const blueFill = resolveShadow({ fill: "blue" }).fill;

        strokes.applyShadows([shadow], [shape], blueFill, []);

        paint.setStyle(ck.PaintStyle.Fill);
        paint.setColor(ck.Color(0, 0, 255, 1));
        shape.draw(paint);

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

        // Rect spans [100,100]-[160,160] (scene Y-up -> canvas translate already
        // accounted for by RectShape). Shadow offset {x:20, y:-20} should push the
        // shadow right and... let's just dump samples around the area.
        console.log("center of rect", at(130, 130));
        console.log("right of rect +30 (should catch shadow if dx=20+blur)", at(190, 130));
        console.log("above rect -30 (should catch shadow if dy maps to up)", at(130, 70));
        console.log("below rect +30", at(130, 190));
        console.log("left of rect -30", at(70, 130));
        console.log("far corner top-right", at(185, 75));

        surface.delete();
        paint.delete();
        rect.deletePaths();

        expect(true).toBe(true);
    });
});
