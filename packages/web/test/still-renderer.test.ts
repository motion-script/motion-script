import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { scene } from "./scene.fixtures";
import { createDrivenScene, createRef } from "@motion-script/core";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { Rect, setTheme, type Theme } from "@motion-script/core";
import { createStillRenderer, type StillRenderer } from "../src/still";

/**
 * The long-lived single-frame renderer.
 *
 * Two properties matter and neither is visible from the returned bytes, so they
 * are asserted structurally: that repeated renders **reuse one Skia surface**
 * (the whole reason to hold a renderer rather than call `exportScreenshot` in a
 * loop), and that the renderer **applies its own theme** rather than leaving the
 * caller to remember the global `setTheme` — the failure mode there is silent,
 * a token resolving to nothing and the frame rendering with wrong colors.
 *
 * Private members are reached through `as any`, as the video-window suite does:
 * the surface identity is genuinely internal, and exporting it purely for a test
 * would be worse than reaching for it here.
 */

const VIEWPORT = { width: 64, height: 64 };
const RED: Theme = { colors: { brand: "#ff0000" } };

let renderer: StillRenderer;

beforeAll(async () => {
    // Warm CanvasKit once; `getCanvasKit` memoizes, so later creates are cheap.
    const warm = await createStillRenderer({ viewport: VIEWPORT, wasmUrl });
    warm.dispose();
});

afterEach(() => {
    renderer?.dispose();
});

async function make(theme?: Theme): Promise<StillRenderer> {
    renderer = await createStillRenderer({ viewport: VIEWPORT, theme, wasmUrl });
    return renderer;
}

/** The surface the context is currently drawing into. */
const surfaceOf = (r: StillRenderer) => (r as any).renderContext.surface;

/** Center pixel of the last drawn frame, as [r, g, b, a]. */
function centerPixel(r: StillRenderer): [number, number, number, number] {
    const snapshot = (r as any).renderContext.snapshotPixels();
    const { pixels, width, height } = snapshot;
    const i = ((Math.floor(height / 2) * width) + Math.floor(width / 2)) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}

const fullBleed = (fill: string) =>
    scene((stage) => stage.add(new Rect({ width: "fill", height: "fill", fill })));

describe("StillRenderer", () => {
    it("renders a node factory, with no scene and no generator", async () => {
        const r = await make();
        const drawn = await r.render(scene((stage) => stage.add(new Rect({ width: "fill", height: "fill", fill: "#ff0000" }))));

        expect(drawn).toEqual({ frame: 0, totalFrames: 1, measuredAll: true });
        expect(centerPixel(r)).toEqual([255, 0, 0, 255]);
    });

    it("reuses one Skia surface across renders", async () => {
        const r = await make();
        await r.render(fullBleed("#ff0000"));
        const first = surfaceOf(r);

        await r.render(fullBleed("#00ff00"));

        expect(surfaceOf(r)).toBe(first);
        expect(centerPixel(r)).toEqual([0, 255, 0, 255]);
    });

    it("keeps that surface when the manifest is swapped", async () => {
        const r = await make();
        await r.render(fullBleed("#ff0000"));
        const first = surfaceOf(r);

        r.setManifest({ image: {}, video: {}, audio: {}, font: {} });
        await r.render(fullBleed("#ff0000"));

        expect(surfaceOf(r)).toBe(first);
    });

    it("rebuilds the surface when the viewport changes", async () => {
        const r = await make();
        await r.render(fullBleed("#ff0000"));
        const first = surfaceOf(r);

        r.setViewport({ width: 32, height: 32 });
        await r.render(fullBleed("#ff0000"));

        expect(surfaceOf(r)).not.toBe(first);
        expect(r.canvas.width).toBe(32);
    });

    it("resolves theme tokens without the caller touching setTheme", async () => {
        // Clear the global registry first: if the renderer did not apply its own
        // theme, "brand" would resolve to nothing and this would not be red.
        setTheme(undefined);
        const r = await make(RED);

        await r.render(fullBleed("brand"));

        expect(centerPixel(r)).toEqual([255, 0, 0, 255]);
    });

    it("re-applies its theme after another caller replaced the global one", async () => {
        const r = await make(RED);
        await r.render(fullBleed("brand"));

        setTheme({ colors: { brand: "#0000ff" } });
        await r.render(fullBleed("brand"));

        expect(centerPixel(r)).toEqual([255, 0, 0, 255]);
    });

    it("encodes the drawn frame as a decodable PNG", async () => {
        const r = await make();
        await r.render(fullBleed("#ff0000"));

        const blob = await r.toBlob({ format: "png" });
        expect(blob.type).toBe("image/png");

        const bitmap = await createImageBitmap(blob);
        expect(bitmap.width).toBe(VIEWPORT.width);
        expect(bitmap.height).toBe(VIEWPORT.height);
    });

    it("addresses a frame by index, time or first/last", async () => {
        const r = await make();
        // Three frames at the renderer's default 60fps, red then green then blue.
        // Written as a driver rather than a chain because what is under test is
        // frame *addressing*, and a driver says "this frame is that colour"
        // directly instead of leaving it to a tween to land on.
        const fills = ["#ff0000", "#00ff00", "#0000ff"];
        const rect = createRef<Rect>();
        const threeFrames = createDrivenScene({
            duration: 3 / 60,
            build: (stage) => stage.add(
                new Rect({ ref: rect, width: "fill", height: "fill", fill: fills[0] }),
            ),
            evaluateAt: (seconds) => {
                rect().fill = fills[Math.min(2, Math.round(seconds * 60))];
            },
        });

        const last = await r.render(threeFrames, { frame: "last" });
        expect(last.totalFrames).toBe(3);
        expect(last.frame).toBe(2);
        expect(centerPixel(r)).toEqual([0, 0, 255, 255]);

        await r.render(threeFrames, { frame: "first" });
        expect(centerPixel(r)).toEqual([255, 0, 0, 255]);

        await r.render(threeFrames, { frame: 1 });
        expect(centerPixel(r)).toEqual([0, 255, 0, 255]);

        // fps defaults to 60, so 1/60s in is frame 1.
        await r.render(threeFrames, { time: 1 / 60 });
        expect(centerPixel(r)).toEqual([0, 255, 0, 255]);
    });

    it("clamps a frame past the end to the last one", async () => {
        const r = await make();
        const oneFrame = scene((stage) => {
            stage.add(new Rect({ width: "fill", height: "fill", fill: "#0000ff" }));
        });

        const drawn = await r.render(oneFrame, { frame: 9999 });

        expect(drawn).toEqual({ frame: 0, totalFrames: 1, measuredAll: true });
        expect(centerPixel(r)).toEqual([0, 0, 255, 255]);
    });

    it("flags a partial measurement, so no caller reports it as the total", async () => {
        const r = await make();
        const solid = (fill: string) => scene((stage) => {
            stage.add(new Rect({ width: "fill", height: "fill", fill }));
        });
        const scenes = [solid("#ff0000"), solid("#00ff00"), solid("#0000ff")];

        // Frame 0 lives in the first scene, so the pass stops there and the
        // total covers that scene alone.
        const first = await r.render(scenes, { frame: "first" });
        expect(first).toEqual({ frame: 0, totalFrames: 1, measuredAll: false });

        // `last` cannot be located without measuring everything.
        const last = await r.render(scenes, { frame: "last" });
        expect(last).toEqual({ frame: 2, totalFrames: 3, measuredAll: true });
        expect(centerPixel(r)).toEqual([0, 0, 255, 255]);
    });

    it("refuses to draw after dispose", async () => {
        const r = await make();
        r.dispose();
        await expect(r.render(fullBleed("#ff0000"))).rejects.toThrow(/disposed/);
    });
});
