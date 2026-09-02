import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import { createDrivenScene, type Scene } from "@/nodes/scene/scene-node";
import { Canvas2D } from "@/nodes/scene/canvas2d-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import type { Stage } from "@/nodes/scene/stage";
import { Precomp } from "@/runtime/precompisition";
import { asCatalog, FakeAssetCatalog, FakeMeasurer } from "@/runtime/runtime.fixtures";
import { attachScope } from "@/nodes/node/node.fixtures";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 30;

/**
 * Build a scene and leave the tree standing.
 *
 * Deliberately not a precomp: `Precomp` calls `scene.reset()`, which disposes
 * and clears the canvas's children, so the tree is gone by the time a pass
 * returns. Building directly is what lets these assert on what was added.
 */
function build(scene: Scene): Scene {
    const stage = new CanvasStage(VIEWPORT, FPS);
    scene.attach(attachScope());
    stage.build(scene);
    return scene;
}

describe("Scene canvas", () => {
    it("builds into a Canvas2D that fills the viewport and stacks children", () => {
        const scene = chainScene(() => { /* no-op */ });
        expect(scene.canvas).toBeInstanceOf(Canvas2D);
        expect(scene.canvas.width).toBe("fill");
        expect(scene.canvas.height).toBe("fill");
        expect(scene.canvas.flow).toBe("freeform");
    });

    it("rebuilds the canvas on reset rather than rewinding it", () => {
        // A scene instance is reused across passes, and restoring props in place
        // meant enumerating what "restore" covered — anything the list missed
        // leaked into the next pass as a tween whose `from` already equalled its
        // target. Constructing a new node has no list to keep current.
        const scene = chainScene((stage) => stage.add(new Rect({ width: 10, height: 10 })));
        build(scene);
        const first = scene.canvas;
        expect(first.children).toHaveLength(1);

        scene.reset();
        expect(scene.canvas).not.toBe(first);
        expect(scene.canvas.children).toHaveLength(0);
    });
});

describe("a scene with no animation", () => {
    it("measures exactly one frame", () => {
        // A zero-duration scene is still a scene: measuring it as no frames would
        // drop it from the timeline entirely.
        const scene = chainScene((stage) => stage.add(new Rect({ width: 10, height: 10 })));
        const result = new Precomp(
            [scene], VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), new FakeMeasurer(),
        ).run();
        expect(result.totalFrames).toBe(1);
        expect(result.scenes[0].frameCount).toBe(1);
        expect(result.buildErrors).toEqual([]);
    });

    it("survives being rebuilt, which every render does at least twice", () => {
        // Precomp measures the scene, then the evaluator builds it again, and
        // `Scene.reset()` disposes the children in between. The driver builds a
        // fresh tree each pass; a node captured outside it would be used after
        // disposal.
        const scene = chainScene((stage) => stage.add(new Rect({ width: 10, height: 10 })));
        const catalog = asCatalog(new FakeAssetCatalog());

        expect(() => {
            new Precomp([scene], VIEWPORT, FPS, catalog, new FakeMeasurer()).run();
            new Precomp([scene], VIEWPORT, FPS, catalog, new FakeMeasurer()).run();
        }).not.toThrow();
        expect(scene.canvas.children).toHaveLength(0);
    });

    it("adds every node the build hands the stage", () => {
        const rects = [new Rect({ width: 1, height: 1 }), new Rect({ width: 2, height: 2 })];
        const children = build(chainScene((stage) => stage.add(rects))).canvas.children;
        expect(rects.every(r => children.includes(r))).toBe(true);
    });

    it("lets a build author the root props and add nothing", () => {
        const scene = build(chainScene((stage) => { stage.set({ fill: "red" }); }));
        expect(scene.canvas.children).toHaveLength(0);
        expect(scene.canvas.fill).toBeTruthy();
    });

    it("lets a build do both — set root props and add a tree", () => {
        const rect = new Rect({ width: 10, height: 10 });
        const scene = build(chainScene((stage) => {
            stage.set({ fill: "red" });
            stage.add(rect);
        }));
        expect(scene.canvas.children).toContain(rect);
        expect(scene.canvas.fill).toBeTruthy();
    });
});

describe("SceneDriver", () => {
    it("reports the duration the runtime measures the scene against", () => {
        const scene = createDrivenScene({
            build: () => { /* nothing */ },
            evaluateAt: () => { /* nothing */ },
            duration: 2,
        });
        expect(scene.duration).toBe(2);
        const result = new Precomp(
            [scene], VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), new FakeMeasurer(),
        ).run();
        expect(result.totalFrames).toBe(60);
    });

    it("is asked for a time rather than advanced to one", () => {
        const asked: number[] = [];
        const scene = createDrivenScene({
            build: () => { /* nothing */ },
            evaluateAt: (seconds) => asked.push(seconds),
            duration: 1,
        });
        build(scene);
        scene.evaluateAt(0.75);
        scene.evaluateAt(0.25);
        expect(asked).toEqual([0.75, 0.25]);
    });
});

describe("CanvasStage authoring surface", () => {
    /**
     * Build through the real `stage.build()` path, so the stage a driver actually
     * receives — determinism plus the canvas forwarders — is the one under test.
     */
    function drive(body: (stage: CanvasStage) => void): Scene {
        return build(chainScene(body as unknown as (stage: Stage) => void));
    }

    it("exposes the composition surface (viewport/fps/random)", () => {
        let seen: { viewport?: unknown; fps?: unknown; rand?: unknown } = {};
        drive((stage) => {
            const random = stage.random("fixed");
            seen = { viewport: stage.viewport, fps: stage.fps, rand: random.nextFloat() };
        });
        expect(seen.viewport).toEqual(VIEWPORT);
        expect(seen.fps).toBe(FPS);
        expect(typeof seen.rand).toBe("number");
    });

    it("routes authoring (add/set) to the scene's canvas", () => {
        const child = new Rect({ width: 10, height: 10 });
        const scene = drive((stage) => {
            stage.set({ fill: "red", zoom: 2 });
            stage.add(child);
        });
        expect(scene.canvas.children).toContain(child);
        expect(scene.canvas.zoom).toBe(2);
    });

    it("exposes the canvas itself for anything not forwarded", () => {
        // Animating the root is a command targeting `null`, not a stage method —
        // the stage carries what a *build* may do, and nothing else.
        const scene = drive((stage) => {
            stage.canvas.set({ heading: 45, lookAt: { x: 20, y: -10 } });
        });
        expect(scene.canvas.heading).toBe(45);
        expect(scene.canvas.lookAt).toEqual({ x: 20, y: -10 });
    });

    it("throws when used outside a build", () => {
        const stage = new CanvasStage(VIEWPORT, FPS);
        expect(() => stage.add(new Rect({ width: 1, height: 1 })))
            .toThrow(/no bound scene/);
    });
});
