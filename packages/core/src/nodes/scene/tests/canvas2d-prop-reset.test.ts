import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import type { Scene } from "@/nodes/scene/scene-node";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { Canvas2D } from "@/nodes/scene/canvas2d-node";
import { attachScope } from "@/nodes/node/node.fixtures";
import { createRef } from "@/util/reference";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10; // dt = 0.1

/**
 * Mirror one full runtime pass: reset → attach → build, then evaluate a frame at
 * a time and sample after each.
 */
function drivePass(scene: Scene, frames: number, read: () => number): number[] {
    const stage = new CanvasStage(VIEWPORT, FPS);
    const dt = 1 / FPS;
    scene.reset();
    scene.attach(attachScope(0));
    stage.reset();
    stage.build(scene);
    scene.sample();

    const samples: number[] = [];
    for (let localFrame = 1; localFrame <= frames; localFrame++) {
        scene.attach(attachScope(localFrame * dt));
        scene.evaluateAt(localFrame * dt);
        samples.push(read());
    }
    return samples;
}

/** A scene that ramps one canvas prop over two seconds. */
function ramping(props: Record<string, unknown>): Scene {
    const root = createRef<Canvas2D>();
    return chainScene(
        (stage) => { root(stage.canvas); },
        [() => root().to(props as never, 2)],
    );
}

describe("canvas-prop animation across passes", () => {
    /**
     * Regression: a prior full pass (precomp measuring duration) leaves the canvas
     * at its tweened end-state. `reset()` replaces it, so the next build's tweens
     * snapshot the right `from` — otherwise `from === target` and the animation
     * visibly does nothing.
     */
    it("re-ramps a canvas prop after a prior full run", () => {
        const scene = ramping({ zoom: 3 });

        // Pass 1 (precomp-like): drive to completion → canvas.zoom ends at 3.
        drivePass(scene, 30, () => scene.canvas.zoom);
        expect(scene.canvas.zoom).toBe(3);

        // Pass 2 (playback): must ramp from the default (1) again, not sit at 3.
        const samples = drivePass(scene, 5, () => scene.canvas.zoom);
        expect(samples[0]).toBeLessThan(3);
        expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]);
    });

    it("re-ramps for padding and heading too (camera + layout props)", () => {
        const padScene = ramping({ padding: 40 });
        drivePass(padScene, 30, () => (padScene.canvas.padding as { top: number }).top);
        const pad = drivePass(padScene, 5, () => (padScene.canvas.padding as { top: number }).top);
        expect(pad[0]).toBeLessThan(40);
        expect(pad[pad.length - 1]).toBeGreaterThan(pad[0]);

        const headScene = ramping({ heading: 90 });
        drivePass(headScene, 30, () => headScene.canvas.heading);
        const head = drivePass(headScene, 5, () => headScene.canvas.heading);
        expect(head[0]).toBeLessThan(90);
        expect(head[head.length - 1]).toBeGreaterThan(head[0]);
    });

    /**
     * The stronger guarantee the evaluation model adds: within a single pass, a
     * frame is a function of its time. A generator could only be advanced, so
     * this needed a whole rebuild; now re-asking is enough.
     */
    it("returns to the start value when asked for frame 0 again", () => {
        const scene = ramping({ zoom: 3 });
        const stage = new CanvasStage(VIEWPORT, FPS);
        scene.reset();
        scene.attach(attachScope(0));
        stage.reset();
        stage.build(scene);

        scene.evaluateAt(2);
        expect(scene.canvas.zoom).toBeCloseTo(3, 5);
        scene.evaluateAt(0);
        expect(scene.canvas.zoom).toBeCloseTo(1, 5);
    });
});
