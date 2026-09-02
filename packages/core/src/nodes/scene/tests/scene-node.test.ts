import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import { createScene, createStill } from "@/nodes/scene/scene-node";
import { Canvas2D } from "@/nodes/scene/canvas2d-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { Precomp } from "@/runtime/precompisition";
import { asCatalog, FakeAssetCatalog, FakeMeasurer } from "@/runtime/runtime.fixtures";
import { attachScope } from "@/nodes/node/node.fixtures";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 30;

describe("Scene canvas", () => {
    it("builds into a Canvas2D that fills the viewport and stacks children", () => {
        const scene = chainScene(() => { /* no-op */
        });
        expect(scene.canvas).toBeInstanceOf(Canvas2D);
        expect(scene.canvas.width).toBe("fill");
        expect(scene.canvas.height).toBe("fill");
        expect(scene.canvas.flow).toBe("freeform");
    });
});

describe("createStill", () => {
    /**
     * Run the still's body and leave the tree standing.
     *
     * Deliberately not a precomp: `Precomp` calls `scene.reset()`, which disposes
     * and clears the canvas's children, so the tree is gone by the time a pass
     * returns. Building directly is what lets these assert on what was added.
     */
    function build(scene: ReturnType<typeof createStill>) {
        const stage = new CanvasStage(VIEWPORT, FPS);
        scene.attach(attachScope());
        const it = stage.build(scene);
        let step = it.next(1 / FPS);
        while (!step.done) step = it.next(1 / FPS);
        return scene;
    }

    it("measures exactly one frame", () => {
        // The load-bearing claim: a body that never yields still gets frame 0
        // processed in full before the loop breaks, so the still is renderable
        // rather than a zero-length scene the timeline skips.
        const scene = createStill(() => new Rect({ width: 10, height: 10 }));
        const result = new Precomp(
            [scene], VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), new FakeMeasurer(),
        ).run();
        expect(result.totalFrames).toBe(1);
        expect(result.scenes[0].frameCount).toBe(1);
        expect(result.buildErrors).toEqual([]);
    });

    it("survives being rebuilt, which every render does at least twice", () => {
        // Precomp measures the scene, then the evaluator replays it, and
        // `Scene.reset()` disposes the children in between. A factory builds a
        // fresh tree each pass; a captured node would be used after disposal.
        const scene = createStill(() => new Rect({ width: 10, height: 10 }));
        const catalog = asCatalog(new FakeAssetCatalog());

        expect(() => {
            new Precomp([scene], VIEWPORT, FPS, catalog, new FakeMeasurer()).run();
            new Precomp([scene], VIEWPORT, FPS, catalog, new FakeMeasurer()).run();
        }).not.toThrow();
        expect(scene.canvas.children).toHaveLength(0);
    });

    it("rejects a node, whose second use would be after disposal", () => {
        expect(() => createStill(new Rect({ width: 10, height: 10 }) as never))
            .toThrow(/takes a factory/);
        expect(() => createStill([new Rect({ width: 10, height: 10 })] as never))
            .toThrow(/takes a factory/);
    });

    it("adds every node a factory returns", () => {
        const rects = [new Rect({ width: 1, height: 1 }), new Rect({ width: 2, height: 2 })];
        const children = build(createStill(() => rects)).canvas.children;
        expect(rects.every(r => children.includes(r))).toBe(true);
    });

    it("adds what a builder returns", () => {
        const rect = new Rect({ width: 10, height: 10 });
        expect(build(createStill(() => rect)).canvas.children).toContain(rect);
    });

    it("lets a builder author the stage and return nothing", () => {
        const scene = build(createStill(stage => { stage.set({ fill: "red" }); }));
        expect(scene.canvas.children).toHaveLength(0);
        expect(scene.canvas.fill).toBeTruthy();
    });

    it("lets a builder do both — set root props and return a tree", () => {
        const rect = new Rect({ width: 10, height: 10 });
        const scene = build(createStill(stage => {
            stage.set({ fill: "red" });
            return rect;
        }));
        expect(scene.canvas.children).toContain(rect);
        expect(scene.canvas.fill).toBeTruthy();
    });
});

describe("CanvasStage authoring surface", () => {
    // Drive a scene generator through the real build() path so the stage the
    // generator actually receives — determinism plus the canvas forwarders — is
    // the one under test.
    function drive(gen: (stage: any) => Generator<void, void, number>) {
        const scene = createScene(gen);
        const stage = new CanvasStage(VIEWPORT, FPS);
        scene.attach(attachScope());
        const it = stage.build(scene);
        // Drain the whole generator (one dt per step) so every sequential
        // command in the body — including duration-0 tweens — runs to completion.
        let step = it.next(1 / FPS);
        for (let i = 0; i < 1000 && !step.done; i++) step = it.next(1 / FPS);
        return scene;
    }

    it("exposes the determinism surface (viewport/fps/random)", () => {
        let seen: { viewport?: unknown; fps?: unknown; rand?: unknown } = {};
        drive(function* (stage) {
            const random = stage.random("fixed");
            seen = { viewport: stage.viewport, fps: stage.fps, rand: random.nextFloat() };
            yield;
        });
        expect(seen.viewport).toEqual(VIEWPORT);
        expect(seen.fps).toBe(FPS);
        expect(typeof seen.rand).toBe("number");
    });

    it("routes authoring (add/set) to the scene's canvas", () => {
        const child = new Rect({ width: 10, height: 10 });
        const scene = drive(function* (stage) {
            stage.set({ fill: "red", zoom: 2 });
            stage.add(child);
            yield;
        });
        expect(scene.canvas.children).toContain(child);
        expect(scene.canvas.zoom).toBe(2);
    });

    it("forwards the generic to() command onto the canvas", () => {
        const scene = drive(function* (stage) {
            yield* stage.to({ zoom: 3 }, 0); // duration 0 → settles immediately
        });
        expect(scene.canvas.zoom).toBe(3);
    });

    it("forwards camera commands (zoomTo/headingTo/panTo) onto the canvas", () => {
        const scene = drive(function* (stage) {
            yield* stage.zoomTo(4, 0);
            yield* stage.headingTo(45, 0);
            yield* stage.panTo({ x: 20, y: -10 }, 0);
        });
        expect(scene.canvas.zoom).toBe(4);
        expect(scene.canvas.heading).toBe(45);
        expect(scene.canvas.lookAt).toEqual({ x: 20, y: -10 });
    });

    it("forwards the fillTo paint command onto the canvas", () => {
        const scene = drive(function* (stage) {
            yield* stage.fillTo("blue", 0);
        });
        // fill resolves to a non-empty array of fill layers once set.
        expect((scene.canvas.fill as unknown[]).length).toBeGreaterThan(0);
    });
});
