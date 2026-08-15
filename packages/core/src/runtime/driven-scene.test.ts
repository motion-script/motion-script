import { describe, expect, it } from "vitest";

import { createDrivenScene, createScene, type SceneDriver } from "@/nodes/scene/scene-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { Precomp } from "./precompisition";
import { StateEvaluator } from "./state-evaluator";
import { AssetCatalog } from "@/assets/catalog";
import { FakeMeasurer } from "./runtime.fixtures";
import { lerpNumber } from "@/tween/lerp";

const FPS = 30;
const VIEWPORT = { width: 100, height: 100 };
const catalog = () => new AssetCatalog({ image: {}, video: {}, audio: {}, font: {} });

/**
 * A driver that slides one rect from x=0 to x=90 over `duration` seconds.
 *
 * The node is built inside `build` rather than captured, for the reason
 * `createStill` documents: the root's children are disposed between passes, so a
 * node held in a closure is torn down before its second use.
 */
function slideDriver(duration: number) {
    let box: Rect | null = null;
    const driver: SceneDriver = {
        duration,
        build: (stage) => {
            box = new Rect({ width: 10, height: 10, x: 0 });
            stage.add(box);
        },
        evaluateAt: (seconds) => {
            box?.set({ x: lerpNumber(0, 90, Math.min(seconds / duration, 1)) });
        },
    };
    return { driver, x: () => box?.x ?? NaN };
}

function evaluatorFor(scene: ReturnType<typeof createDrivenScene>, frames: number): StateEvaluator {
    return new StateEvaluator([scene], VIEWPORT, FPS, catalog(), [frames], new FakeMeasurer());
}

describe("createDrivenScene", () => {
    it("measures its declared duration rather than being run to find out", () => {
        // A driven body never yields, so without the declaration precomp would
        // measure it as a single frame — the same shape `createStill` relies on.
        const { driver } = slideDriver(2);
        const precomp = new Precomp(
            [createDrivenScene(driver)], VIEWPORT, FPS, catalog(), new FakeMeasurer(),
        ).run();

        expect(precomp.totalFrames).toBe(60);
    });

    it("evaluates a frame without visiting the frames before it", () => {
        const { driver, x } = slideDriver(1);
        const evaluator = evaluatorFor(createDrivenScene(driver), FPS);

        evaluator.stateAt(FPS - 1);
        expect(x()).toBeCloseTo(90 * ((FPS - 1) / FPS), 5);
    });

    it("costs the same going backwards as forwards", () => {
        // The point of the whole seam. A generator scene reaching an earlier
        // frame has to reset its slot and replay from zero; this just asks again.
        const { driver, x } = slideDriver(1);
        const evaluator = evaluatorFor(createDrivenScene(driver), FPS);

        evaluator.stateAt(FPS - 1);
        const atEnd = x();
        evaluator.stateAt(0);
        expect(x()).toBeCloseTo(0, 5);

        evaluator.stateAt(FPS - 1);
        expect(x()).toBeCloseTo(atEnd, 5);
    });

    it("lands on the same values however the playhead arrived", () => {
        // Path-independence is what makes out-of-order evaluation safe at all —
        // and what an exporter needs to render frames in parallel.
        const walked = slideDriver(1);
        const jumped = slideDriver(1);
        const a = evaluatorFor(createDrivenScene(walked.driver), FPS);
        const b = evaluatorFor(createDrivenScene(jumped.driver), FPS);

        for (let frame = 0; frame <= 15; frame++) a.stateAt(frame);
        b.stateAt(15);

        expect(jumped.x()).toBeCloseTo(walked.x(), 5);
    });

    it("leaves a generator scene on the replay path", () => {
        const scene = createScene(function* (stage) {
            const box = new Rect({ width: 10, height: 10 });
            stage.add(box);
            yield* box.to({ x: 90 }, 1);
        });

        expect(scene.drivenDuration).toBeNull();
        expect(scene.evaluateAt(0.5)).toBe(false);
    });
});
