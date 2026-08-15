import { describe, it, expect } from "vitest";
import { createScene, createStill } from "./scene-node";
import { RootNode } from "./root-node";
import { Rect } from "../geometry/rect-node";
import { BuildStage } from "@/render/build-stage";
import { Precomp } from "@/runtime/precompisition";
import { asCatalog, FakeAssetCatalog, FakeMeasurer } from "@/runtime/runtime.fixtures";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 30;

describe("Scene root", () => {
    it("builds into a RootNode root that fills the viewport and stacks children", () => {
        const scene = createScene(function* () { /* no-op */ });
        expect(scene.root).toBeInstanceOf(RootNode);
        expect(scene.root.width).toBe("fill");
        expect(scene.root.height).toBe("fill");
        expect(scene.root.flow).toBe("freeform");
    });
});

describe("createStill", () => {
    /**
     * Run the still's body and leave the tree standing.
     *
     * Deliberately not a precomp: `Precomp` calls `scene.reset()`, which disposes
     * and clears the root's children, so the tree is gone by the time a pass
     * returns. Building directly is what lets these assert on what was added.
     */
    function build(scene: ReturnType<typeof createStill>) {
        const stage = new BuildStage<typeof scene>(VIEWPORT, FPS);
        const it = scene.build(stage);
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
        expect(scene.root.children).toHaveLength(0);
    });

    it("rejects a node, whose second use would be after disposal", () => {
        expect(() => createStill(new Rect({ width: 10, height: 10 }) as never))
            .toThrow(/takes a factory/);
        expect(() => createStill([new Rect({ width: 10, height: 10 })] as never))
            .toThrow(/takes a factory/);
    });

    it("adds every node a factory returns", () => {
        const rects = [new Rect({ width: 1, height: 1 }), new Rect({ width: 2, height: 2 })];
        const children = build(createStill(() => rects)).root.children;
        expect(rects.every(r => children.includes(r))).toBe(true);
    });

    it("adds what a builder returns", () => {
        const rect = new Rect({ width: 10, height: 10 });
        expect(build(createStill(() => rect)).root.children).toContain(rect);
    });

    it("lets a builder author the stage and return nothing", () => {
        const scene = build(createStill(stage => { stage.set({ fill: "red" }); }));
        expect(scene.root.children).toHaveLength(0);
        expect(scene.root.fill).toBeTruthy();
    });

    it("lets a builder do both — set root props and return a tree", () => {
        const rect = new Rect({ width: 10, height: 10 });
        const scene = build(createStill(stage => {
            stage.set({ fill: "red" });
            return rect;
        }));
        expect(scene.root.children).toContain(rect);
        expect(scene.root.fill).toBeTruthy();
    });
});

describe("Scene.build merged stage", () => {
    // Drive a scene generator to its first yield through the real build() path so
    // the Proxy that merges the BuildStage (determinism) with the Scene
    // (authoring) is actually exercised.
    function drive(gen: (stage: any) => Generator<void, void, number>) {
        const scene = createScene(gen);
        const stage = new BuildStage<typeof scene>(VIEWPORT, FPS);
        const it = scene.build(stage);
        // Drain the whole generator (one dt per step) so every sequential
        // command in the body — including duration-0 tweens — runs to completion.
        let step = it.next(1 / FPS);
        for (let i = 0; i < 1000 && !step.done; i++) step = it.next(1 / FPS);
        return scene;
    }

    it("exposes the BuildStage determinism surface (viewport/fps/random)", () => {
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

    it("routes authoring (add/set) to the scene's root", () => {
        const child = new Rect({ width: 10, height: 10 });
        const scene = drive(function* (stage) {
            stage.set({ fill: "red", zoom: 2 });
            stage.add(child);
            yield;
        });
        expect(scene.root.children).toContain(child);
        expect(scene.root.zoom).toBe(2);
    });

    it("forwards the generic to() command onto the root", () => {
        const scene = drive(function* (stage) {
            yield* stage.to({ zoom: 3 }, 0); // duration 0 → settles immediately
        });
        expect(scene.root.zoom).toBe(3);
    });

    it("forwards camera commands (zoomTo/headingTo/panTo) onto the root", () => {
        const scene = drive(function* (stage) {
            yield* stage.zoomTo(4, 0);
            yield* stage.headingTo(45, 0);
            yield* stage.panTo({ x: 20, y: -10 }, 0);
        });
        expect(scene.root.zoom).toBe(4);
        expect(scene.root.heading).toBe(45);
        expect(scene.root.lookAt).toEqual({ x: 20, y: -10 });
    });

    it("forwards the fillTo paint command onto the root", () => {
        const scene = drive(function* (stage) {
            yield* stage.fillTo("blue", 0);
        });
        // fill resolves to a non-empty array of fill layers once set.
        expect((scene.root.fill as unknown[]).length).toBeGreaterThan(0);
    });
});
