import { describe, it, expect, beforeAll, afterEach } from "vitest";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import { createStill, Rect } from "@motion-script/core";
import { createStillRenderer, type StillRenderer } from "../src/still";

/**
 * Which corner a per-corner `cornerRadius` actually rounds, in pixels.
 *
 * Descriptor coordinates are authored **y-up** and the canvas is y-down, and the
 * renderer bridges the two by negating each shape's centre y as it enters the
 * paint pass (`flipPositionY` in `skia-render/render-context.ts`). Moving a
 * centre is not mirroring a shape — `RectShape` still lays its geometry out from
 * that centre in canvas terms, so `topLeft` is the visually-higher-left corner
 * on both sides of the flip — but that is exactly the kind of claim that reads
 * either way round on the page and can only be settled by looking at the output.
 * It was wrong once: the flip used to swap the top and bottom entries, which put
 * an authored top radius on the visual bottom and disagreed with
 * `containsClip`, the y-up hit test derived from the very same descriptor.
 *
 * So this renders one asymmetric rect and reads four pixels. It is deliberately
 * about the *visual* corners rather than about any intermediate representation:
 * an assertion on the state handed to `RectShape` would have passed throughout.
 */

const SIZE = 64;
/** Half the box, so the rounded corner unmistakably clears the sampled pixel. */
const RADIUS = 32;
/** Far enough into a corner to be outside a 32px arc, inside the box. */
const INSET = 3;

let renderer: StillRenderer;

beforeAll(async () => {
    const warm = await createStillRenderer({
        viewport: { width: SIZE, height: SIZE },
        wasmUrl,
    });
    warm.dispose();
});

afterEach(() => {
    renderer?.dispose();
});

/**
 * Whether `(x, y)` of the last drawn frame is inside the rect, in image space
 * (row 0 = top).
 *
 * Read off the **red channel** rather than the alpha: the still renderer paints
 * an opaque ground under the frame, so every pixel comes back at alpha 255 and a
 * cut corner is invisible in that channel. The rect is pure red and the ground
 * is not, so red is what tells them apart.
 */
function isRect(r: StillRenderer, x: number, y: number): boolean {
    const { pixels, width } = (r as any).renderContext.snapshotPixels();
    return pixels[(y * width + x) * 4] > 128;
}

/** Render a full-bleed rect rounded at exactly one corner. */
async function renderRounded(corner: string): Promise<StillRenderer> {
    renderer = await createStillRenderer({
        viewport: { width: SIZE, height: SIZE },
        wasmUrl,
    });
    await renderer.render(
        createStill(
            () =>
                new Rect({
                    width: "fill",
                    height: "fill",
                    fill: "#ff0000",
                    cornerRadius: {
                        topLeft: 0,
                        topRight: 0,
                        bottomLeft: 0,
                        bottomRight: 0,
                        [corner]: RADIUS,
                    } as never,
                }),
        ),
    );
    return renderer;
}

describe("a rect's per-corner radius lands on the corner it names", () => {
    it("cuts the visual top-left for `topLeft`", async () => {
        const r = await renderRounded("topLeft");

        expect(isRect(r, INSET, INSET)).toBe(false);
        expect(isRect(r, SIZE - INSET, INSET)).toBe(true);
        expect(isRect(r, INSET, SIZE - INSET)).toBe(true);
        expect(isRect(r, SIZE - INSET, SIZE - INSET)).toBe(true);
    });

    it("cuts the visual bottom-right for `bottomRight`", async () => {
        const r = await renderRounded("bottomRight");

        expect(isRect(r, SIZE - INSET, SIZE - INSET)).toBe(false);
        expect(isRect(r, INSET, INSET)).toBe(true);
    });

    it("cuts the visual top-right for `topRight`", async () => {
        const r = await renderRounded("topRight");

        expect(isRect(r, SIZE - INSET, INSET)).toBe(false);
        expect(isRect(r, INSET, SIZE - INSET)).toBe(true);
    });
});
