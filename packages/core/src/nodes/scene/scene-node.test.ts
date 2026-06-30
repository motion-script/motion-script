import { describe, it, expect } from "vitest";
import { createScene } from "./scene-node";
import { RootNode } from "./root-node";
import { Rect } from "../geometry/rect-node";
import { BuildStage } from "@/render/build-stage";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 30;

describe("Scene root", () => {
    it("builds into a RootNode root that fills the viewport and stacks children", () => {
        const scene = createScene(function* () { /* no-op */ });
        expect(scene.root).toBeInstanceOf(RootNode);
        expect(scene.root.width).toBe("fill");
        expect(scene.root.height).toBe("fill");
        expect(scene.root.group).toBe("stack");
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

    it("forwards camera commands (zoomTo/headingTo/originTo) onto the root", () => {
        const scene = drive(function* (stage) {
            yield* stage.zoomTo(4, 0);
            yield* stage.headingTo(45, 0);
            yield* stage.originTo({ x: 20, y: -10 }, 0);
        });
        expect(scene.root.zoom).toBe(4);
        expect(scene.root.heading).toBe(45);
        expect(scene.root.origin).toEqual({ x: 20, y: -10 });
    });

    it("forwards the fillTo paint command onto the root", () => {
        const scene = drive(function* (stage) {
            yield* stage.fillTo("blue", 0);
        });
        // fill resolves to a non-empty array of fill layers once set.
        expect((scene.root.fill as unknown[]).length).toBeGreaterThan(0);
    });
});
