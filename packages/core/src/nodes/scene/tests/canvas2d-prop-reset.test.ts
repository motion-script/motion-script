import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import { createScene, Scene } from "@/nodes/scene/scene-node";
import { CanvasStage } from "@/nodes/scene/canvas-stage";
import { attachScope } from "@/nodes/node/node.fixtures";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10; // dt = 0.1

// Mirror StateEvaluator.resetSlot + its advance loop: reset → attach → build →
// prime, then per frame re-attach at the new time before generator.next(dt).
function drivePass(scene: Scene, frames: number, read: () => number): number[] {
    const stage = new CanvasStage(VIEWPORT, FPS);
    const dt = 1 / FPS;
    scene.reset();
    scene.attach(attachScope(0));
    stage.reset();
    const gen = stage.build(scene);
    gen.next(dt); // prime to first yield
    scene.sample();

    const samples: number[] = [];
    for (let localFrame = 1; localFrame <= frames; localFrame++) {
        scene.attach(attachScope(localFrame * dt));
        gen.next(dt);
        samples.push(read());
    }
    return samples;
}

describe("canvas-prop animation across passes", () => {
    // Regression: a prior full pass (e.g. precomp measuring duration) leaves the
    // canvas at its tweened end-state. reset() replaces it, so the next build's
    // tweens snapshot the right `from` — otherwise from === target and the
    // animation visibly does nothing.
    it("re-ramps a stage-animated canvas prop after a prior full run", () => {
        const scene = chainScene((stage) => {
        }, [
            () => stage.to({ zoom: 3 }, 2),
        ]);

        // Pass 1 (precomp-like): drive to completion → canvas.zoom ends at 3.
        drivePass(scene, 30, () => scene.canvas.zoom);
        expect(scene.canvas.zoom).toBe(3);

        // Pass 2 (playback): must ramp from the default (1) again, not sit at 3.
        const samples = drivePass(scene, 5, () => scene.canvas.zoom);
        expect(samples[0]).toBeLessThan(3);
        expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]);
    });

    it("re-ramps for padding and heading too (camera + layout props)", () => {
        const padScene = chainScene((stage) => {
        }, [
            () => stage.to({ padding: 40 }, 2),
        ]);
        drivePass(padScene, 30, () => (padScene.canvas.padding as { top: number }).top);
        const pad = drivePass(padScene, 5, () => (padScene.canvas.padding as { top: number }).top);
        expect(pad[0]).toBeLessThan(40);

        const headScene = chainScene((stage) => {
        }, [
            () => stage.headingTo(90, 2),
        ]);
        drivePass(headScene, 30, () => headScene.canvas.heading);
        const head = drivePass(headScene, 5, () => headScene.canvas.heading);
        expect(head[0]).toBeLessThan(90);
    });
});
