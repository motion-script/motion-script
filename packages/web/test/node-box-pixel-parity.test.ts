import { describe, it, expect, beforeAll, afterEach } from "vitest";
import wasmUrl from "@motion-script/canvaskit/canvaskit.wasm?url";
import {
    ManifestAssetCatalog,
    PlaybackController,
    Line,
    Precomp,
    Rect,
    createScene,
    setTheme,
    type NodeBox,
    type Scene,
} from "@motion-script/core";
import { getCanvasKit } from "../src/getter";
import { WebRenderContext } from "../src/render-context";
import { WebStorageAdapter } from "../src/storage-adapter";
import { WebMeasurer } from "../src/measurer";
import { WebMasterClock } from "../src/master-clock";
import { WebAudioDevice } from "../src/audio/player";

/**
 * `getNodeBox` claims to report where a node's pixels **actually landed**, so an
 * editor can lay a selection gizmo over them. Core's own tests assert that
 * against a fake render context — which can only prove the geometry is
 * self-consistent, never that it agrees with Skia.
 *
 * So: draw a red rect through the real `WebRenderContext`, read the framebuffer
 * back, and compare the extent of the red pixels with the box the controller
 * reports. The camera cases are the point of the exercise — a camera is applied
 * at render time (`beginCamera`) and is invisible to `Node2D.global`, so a box
 * built without it looks perfectly reasonable and sits in the wrong place the
 * moment a scene zooms.
 */

const VIEWPORT = { width: 200, height: 200 };
const FPS = 10;

let canvasKit: Awaited<ReturnType<typeof getCanvasKit>>;

beforeAll(async () => {
    canvasKit = await getCanvasKit(wasmUrl);
    setTheme(undefined);
});

interface Harness {
    controller: PlaybackController;
    renderContext: WebRenderContext;
    canvas: HTMLCanvasElement;
    dispose(): void;
}

let live: Harness | null = null;
afterEach(() => {
    live?.dispose();
    live = null;
});

function mount(scenes: Scene[]): Harness {
    const canvas = document.createElement("canvas");
    canvas.width = VIEWPORT.width;
    canvas.height = VIEWPORT.height;
    canvas.style.display = "none";
    document.body.appendChild(canvas);

    const catalog = new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} });
    const storage = new WebStorageAdapter(canvasKit, catalog, VIEWPORT, FPS);
    const measure = new WebMeasurer(storage);
    const audio = new WebAudioDevice();
    const renderContext = new WebRenderContext(canvasKit, storage);
    renderContext.mount(canvas);

    const controller = new PlaybackController({
        renderContext,
        measurer: measure,
        storageAdapter: storage,
        masterClock: new WebMasterClock({ context: audio.getContext(), fps: FPS }),
        audioDevice: audio,
        assets: catalog,
        precomposition: new Precomp(scenes, VIEWPORT, FPS, catalog, measure),
        fps: FPS,
        viewport: VIEWPORT,
        scenes,
    });

    const harness: Harness = {
        controller,
        renderContext,
        canvas,
        dispose() {
            controller.dispose();
            renderContext.dispose();
            canvas.remove();
        },
    };
    live = harness;
    return harness;
}

/** Axis-aligned pixel extent of everything strongly red in the current frame. */
function redExtent(ctx: WebRenderContext): { minX: number; maxX: number; minY: number; maxY: number } | null {
    const { pixels, width, height } = (ctx as unknown as {
        snapshotPixels(): { pixels: Uint8Array; width: number; height: number };
    }).snapshotPixels();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            // Any meaningful red coverage counts — a rotated edge is antialiased,
            // so the extreme pixels are only partly covered.
            if (pixels[i] > 40 && pixels[i + 1] < 40 && pixels[i + 3] > 40) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return minX === Infinity ? null : { minX, maxX, minY, maxY };
}

/**
 * The same extent, derived from a reported box: viewport space is centred and
 * y-up, the framebuffer is top-left and y-down.
 */
function boxExtent(box: NodeBox): { minX: number; maxX: number; minY: number; maxY: number } {
    const corners = [box.topLeft, box.topRight, box.bottomRight, box.bottomLeft];
    const xs = corners.map(c => VIEWPORT.width / 2 + c.x);
    const ys = corners.map(c => VIEWPORT.height / 2 - c.y);
    return {
        minX: Math.min(...xs),
        // The far edge is exclusive in pixel terms: a box spanning [130, 170)
        // lights up pixels 130…169.
        maxX: Math.max(...xs) - 1,
        minY: Math.min(...ys),
        maxY: Math.max(...ys) - 1,
    };
}

/**
 * A red 40×24 card at (30, 20), under a black stage configured by `root`.
 *
 * Placed well inboard of the 200×200 viewport so every camera below keeps the
 * whole card on screen — a clipped box would be compared against a clamped pixel
 * extent, which is not the same assertion.
 */
function cardScene(root: Record<string, unknown>): Scene {
    return createScene(function* (stage) {
        stage.set({ fill: "#000000", ...root });
        stage.add(new Rect({ width: 40, height: 24, x: 30, y: 20, fill: "#ff0000" }));
        yield;
    });
}

async function boxAndPixels(root: Record<string, unknown>) {
    const { controller, renderContext } = mount([cardScene(root)]);
    await controller.seek(0);
    return { reported: boxExtent(controller.getNodeBox("0")!), drawn: redExtent(renderContext)! };
}

/**
 * Both extents must agree to within a pixel of antialiasing.
 *
 * The reported box is asserted to be fully on-screen first: a camera clips to
 * its viewport, so a box hanging off the edge would be compared against a
 * *clamped* pixel extent and the edge would agree for the wrong reason.
 */
function expectAligned(
    reported: { minX: number; maxX: number; minY: number; maxY: number },
    drawn: { minX: number; maxX: number; minY: number; maxY: number } | null,
): void {
    expect(reported.minX).toBeGreaterThanOrEqual(0);
    expect(reported.minY).toBeGreaterThanOrEqual(0);
    expect(reported.maxX).toBeLessThan(VIEWPORT.width);
    expect(reported.maxY).toBeLessThan(VIEWPORT.height);

    expect(drawn).not.toBeNull();
    expect(drawn!.minX).toBeCloseTo(reported.minX, -0.31);   // ±1px
    expect(drawn!.maxX).toBeCloseTo(reported.maxX, -0.31);
    expect(drawn!.minY).toBeCloseTo(reported.minY, -0.31);
    expect(drawn!.maxY).toBeCloseTo(reported.maxY, -0.31);
}

describe("getNodeBox lands on the pixels Skia drew", () => {
    it("with the camera at rest", async () => {
        const { reported, drawn } = await boxAndPixels({});
        // Sanity-check the arithmetic itself before trusting the comparison:
        // centre (30, 20) in a 200×200 viewport is pixel (130, 80), half-extents
        // 20 × 12.
        expect(reported).toEqual({ minX: 110, maxX: 149, minY: 68, maxY: 91 });
        expectAligned(reported, drawn);
    });

    it("under a zoomed camera — the case Node2D.global cannot see", async () => {
        const { reported, drawn } = await boxAndPixels({ zoom: 1.5 });
        // Scaled about the viewport centre: centre (45, 30) ⇒ pixel (145, 70),
        // half-extents 30 × 18. `Node2D.global` still reports (30, 20).
        expect(reported).toEqual({ minX: 115, maxX: 174, minY: 52, maxY: 87 });
        expectAligned(reported, drawn);
    });

    it("under a panned camera", async () => {
        const { reported, drawn } = await boxAndPixels({ lookAt: { x: 30, y: 20 } });
        // The camera centres on the card, so it lands dead centre on screen.
        expect(reported).toEqual({ minX: 80, maxX: 119, minY: 88, maxY: 111 });
        expectAligned(reported, drawn);
    });

    it("under a rotated, zoomed and panned camera all at once", async () => {
        const { reported, drawn } = await boxAndPixels({
            zoom: 1.2,
            heading: 20,
            lookAt: { x: 10, y: -5 },
        });
        expectAligned(reported, drawn);
    });

    it("with the node itself rotated inside a rotated camera", async () => {
        const { controller, renderContext } = mount([
            createScene(function* (stage) {
                stage.set({ fill: "#000000", zoom: 1.25, heading: -20 });
                stage.add(new Rect({ width: 40, height: 24, x: 30, y: 20, rotation: 35, fill: "#ff0000" }));
                yield;
            }),
        ]);
        await controller.seek(0);
        expectAligned(boxExtent(controller.getNodeBox("0")!), redExtent(renderContext));
    });
});

describe("a Line's box sits on the line, not on its layout cell", () => {
    it("bounds the drawn stroke even though points never reach layout", async () => {
        // 'fill' sizing, so the layout cell is the whole 200×200 viewport — the
        // box must come from the points instead. Asymmetric on purpose: the ink
        // is off-centre relative to the node.
        const { controller, renderContext } = mount([
            createScene(function* (stage) {
                stage.set({ fill: "#000000" });
                stage.add(new Line({
                    points: [{ x: 0, y: 0 }, { x: 60, y: 40 }],
                    stroke: { weight: 10, fill: "#ff0000" },
                }));
                yield;
            }),
        ]);
        await controller.seek(0);

        const box = controller.getNodeBox("0")!;
        // Not the 200×200 cell: the points' span (60×40) grown by half the stroke.
        expect(box.width).toBe(70);
        expect(box.height).toBe(50);
        expect(box.center.x).toBeCloseTo(30, 6);
        expect(box.center.y).toBeCloseTo(20, 6);

        // And it contains every red pixel Skia actually drew.
        //
        // Containment, not equality: a stroke box is conservative by nature. Half
        // the weight is added on all four sides, but a *diagonal* stroke with butt
        // caps only extends perpendicular to the line, so the box overshoots along
        // each axis by up to half the weight. Over-covering is the safe direction —
        // the failure that matters is ink outside the gizmo, not slack inside it.
        const reported = boxExtent(box);
        const drawn = redExtent(renderContext)!;
        const slack = 10 / 2 + 1;   // half the stroke weight, plus a pixel of AA
        expect(drawn.minX).toBeGreaterThanOrEqual(reported.minX - 1);
        expect(drawn.maxX).toBeLessThanOrEqual(reported.maxX + 1);
        expect(drawn.minY).toBeGreaterThanOrEqual(reported.minY - 1);
        expect(drawn.maxY).toBeLessThanOrEqual(reported.maxY + 1);
        // …and is not loose by more than that conservative margin.
        expect(drawn.minX - reported.minX).toBeLessThanOrEqual(slack);
        expect(reported.maxX - drawn.maxX).toBeLessThanOrEqual(slack);
        expect(drawn.minY - reported.minY).toBeLessThanOrEqual(slack);
        expect(reported.maxY - drawn.maxY).toBeLessThanOrEqual(slack);
    });

    it("is exact for an axis-aligned line, where the stroke box is tight", async () => {
        // A horizontal stroke extends exactly half its weight above and below, so
        // here the conservative bound and the drawn ink coincide on the y axis.
        const { controller, renderContext } = mount([
            createScene(function* (stage) {
                stage.set({ fill: "#000000" });
                stage.add(new Line({
                    points: [{ x: -40, y: 10 }, { x: 40, y: 10 }],
                    stroke: { weight: 12, fill: "#ff0000", cap: "square" },
                }));
                yield;
            }),
        ]);
        await controller.seek(0);

        const box = controller.getNodeBox("0")!;
        expect(box.width).toBe(92);     // 80 span + 6 either side
        expect(box.height).toBe(12);
        expectAligned(boxExtent(box), redExtent(renderContext));
    });
});

describe("the drag loop moves pixels without tearing down the surface", () => {
    /** The Skia surface currently being drawn into. */
    const surfaceOf = (ctx: WebRenderContext) => (ctx as unknown as { surface: unknown }).surface;

    it("setNodeOverride + repaint repaints in place, and clearing restores", async () => {
        const { controller, renderContext } = mount([cardScene({})]);
        await controller.seek(0);

        const surface = surfaceOf(renderContext);
        const before = redExtent(renderContext)!;
        expect(before.minX).toBe(110);

        // One iteration of what a pointermove handler does.
        controller.setNodeOverride("0", { x: -60, y: 20 });
        controller.repaint();

        const dragged = redExtent(renderContext)!;
        // Centre moved from x=30 to x=-60 ⇒ 90 units left; height band unchanged.
        expect(dragged.minX).toBe(before.minX - 90);
        expect(dragged.maxX).toBe(before.maxX - 90);
        expect(dragged.minY).toBe(before.minY);
        // The reported box tracks the pixels through the override.
        expectAligned(boxExtent(controller.getNodeBox("0")!), dragged);

        // The whole point of overrides: no rebuild, so the WebGL surface — and
        // everything cached on it — survives the drag.
        expect(surfaceOf(renderContext)).toBe(surface);

        // Pointer-up: the host commits to its own model and drops the override.
        controller.clearNodeOverrides("0");
        expect(redExtent(renderContext)!).toEqual(before);
        expect(surfaceOf(renderContext)).toBe(surface);
    });

    it("holds the override across a scrub, then releases it", async () => {
        // The card slides right over 10 frames; an override must beat the tween
        // at whatever frame the playhead lands on.
        const { controller, renderContext } = mount([
            createScene(function* (stage) {
                stage.set({ fill: "#000000" });
                const card = new Rect({ width: 40, height: 24, x: 30, y: 20, fill: "#ff0000" });
                stage.add(card);
                yield* card.to({ x: 90 }, 1);
                for (let i = 0; i < 5; i++) yield;
            }),
        ]);

        await controller.seek(10);
        const atEnd = redExtent(renderContext)!;
        expect(atEnd.minX).toBe(170);          // x=90 ⇒ pixel centre 190, minus half-width 20

        controller.setNodeOverride("0", { x: 30 });
        controller.repaint();
        expect(redExtent(renderContext)!.minX).toBe(110);

        // Scrub backwards — a full generator replay — and the override still wins.
        await controller.seek(2);
        expect(redExtent(renderContext)!.minX).toBe(110);

        controller.clearNodeOverrides();
        await controller.seek(10);
        expect(redExtent(renderContext)!).toEqual(atEnd);
    });
});

describe("pickNode agrees with the pixels", () => {
    it("picks the node at a point that is red, and nothing where it is not", async () => {
        // A pan, so the card moves *off* the position it occupies at rest — a
        // zoom grows it about the centre and would keep covering that point.
        const { controller } = mount([cardScene({ lookAt: { x: 30, y: 20 } })]);
        await controller.seek(0);

        // The camera centres on the card, so the viewport centre is now on it.
        expect(controller.pickNode({ x: 0, y: 0 })!.path).toBe("0");
        // Where the node draws with the camera at rest — black on screen here.
        expect(controller.pickNode({ x: 30, y: 20 })).toBeNull();
    });
});
