import { describe, it, expect } from "vitest";
import { createScene, Scene } from "./scene-node";
import { BuildStage } from "@/render/build-stage";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10; // dt = 0.1

// Mirror StateEvaluator.resetSlot + its advance loop: reset → build → prime,
// then per frame ellapse(globalTime) before generator.next(dt).
function drivePass(scene: Scene, frames: number, read: () => number): number[] {
    const stage = new BuildStage<Scene>(VIEWPORT, FPS);
    const dt = 1 / FPS;
    scene.reset();
    scene.ellapse(0);
    stage.reset();
    const gen = scene.build(stage);
    gen.next(dt); // prime to first yield
    scene.sample();

    const samples: number[] = [];
    for (let localFrame = 1; localFrame <= frames; localFrame++) {
        scene.ellapse(localFrame * dt);
        gen.next(dt);
        samples.push(read());
    }
    return samples;
}

describe("root-prop animation across passes", () => {
    // Regression: a prior full pass (e.g. precomp measuring duration) leaves the
    // persistent root at its tweened end-state. reset() must restore the root's
    // own props to defaults so the next build's tweens snapshot the right `from`
    // — otherwise from === target and the animation visibly does nothing.
    it("re-ramps a stage-animated root prop after a prior full run", () => {
        const scene = createScene(function* (stage) {
            yield* stage.to({ zoom: 3 }, 2);
        });

        // Pass 1 (precomp-like): drive to completion → root.zoom ends at 3.
        drivePass(scene, 30, () => scene.root.zoom);
        expect(scene.root.zoom).toBe(3);

        // Pass 2 (playback): must ramp from the default (1) again, not sit at 3.
        const samples = drivePass(scene, 5, () => scene.root.zoom);
        expect(samples[0]).toBeLessThan(3);
        expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]);
    });

    it("re-ramps for padding and heading too (camera + layout props)", () => {
        const padScene = createScene(function* (stage) {
            yield* stage.to({ padding: 40 }, 2);
        });
        drivePass(padScene, 30, () => (padScene.root.padding as { top: number }).top);
        const pad = drivePass(padScene, 5, () => (padScene.root.padding as { top: number }).top);
        expect(pad[0]).toBeLessThan(40);

        const headScene = createScene(function* (stage) {
            yield* stage.headingTo(90, 2);
        });
        drivePass(headScene, 30, () => headScene.root.heading);
        const head = drivePass(headScene, 5, () => headScene.root.heading);
        expect(head[0]).toBeLessThan(90);
    });
});
