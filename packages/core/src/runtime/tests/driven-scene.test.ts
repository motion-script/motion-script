import { describe, expect, it } from "vitest";

import { createDrivenScene, type SceneDriver } from "@/nodes/scene/scene-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { Precomp } from "@/runtime/precompisition";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { ManifestAssetCatalog } from "@/assets/catalog";
import { FakeMeasurer } from "@/runtime/runtime.fixtures";
import { lerpNumber } from "@/tween/lerp";

const FPS = 30;
const VIEWPORT = { width: 100, height: 100 };
const catalog = () => new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} });

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

    it("does not rebuild the tree to seek backwards", () => {
        // The whole point, and the thing the driver is *for*. A generator can
        // only be advanced, so reaching an earlier frame means disposing the tree
        // and replaying from zero — which is why a backward scrub cost more the
        // further into a scene it happened. A driver is asked for a time, so
        // there is nothing to rewind.
        //
        // Counted by builds rather than timed, because the cost this is about is
        // the reconstruction: `beginReplay` used to reset any slot whose target
        // was behind it, driven or not, which threw away the tree and recompiled
        // every command only to ask the same question of the result.
        let builds = 0;
        const { driver, x } = slideDriver(2);
        const counting: SceneDriver = {
            ...driver,
            build: (stage) => {
                builds++;
                driver.build(stage);
            },
        };
        const scene = createDrivenScene(counting);
        const evaluator = evaluatorFor(scene, 60);

        evaluator.stateAt(59);
        expect(builds).toBe(1);
        const atEnd = x();

        // Walk backwards a frame at a time — the shape that used to be worst.
        for (let frame = 58; frame >= 0; frame--) evaluator.stateAt(frame);
        expect(builds).toBe(1);
        expect(x()).toBeCloseTo(0, 4);

        // ...and forwards again, still on the one tree.
        evaluator.stateAt(59);
        expect(builds).toBe(1);
        expect(x()).toBeCloseTo(atEnd, 4);
    });
});

/**
 * Motion on a driven scene has to be a property of the *frame*, not of the seek
 * that arrived at it.
 *
 * A driven scene never replays — it jumps straight to whatever frame is asked
 * for — so a velocity taken as a backward difference against "wherever the
 * playhead last sat" reads whatever the viewer's scrubbing happened to imply: a
 * static node smears when the pointer moves fast, a frame held still shows
 * nothing, and stepping backward reads zero. Motion blur and trails are built on
 * that velocity, so the same frame looked different depending on how it was
 * reached.
 *
 * The evaluator now evaluates the previous frame and primes the history from it,
 * so these all have to agree.
 */
describe("driven motion is deterministic per frame", () => {
    /**
     * The sampled motion state, which nothing exposes publicly — it reaches the
     * renderer through `ctx.begin(state)` and nowhere else.
     */
    const velocityOf = (node: Rect) =>
        (node as unknown as { _renderState: { velocity: { x: number } } })
            ._renderState.velocity.x

    /** The rect's velocity at `frame`, reached by the given sequence of seeks. */
    function velocityAfter(seeks: number[], frames = 60) {
        const { driver } = slideDriver(2);
        const scene = createDrivenScene(driver);
        const evaluator = evaluatorFor(scene, frames);
        let box: Rect | null = null;
        for (const frame of seeks) {
            evaluator.stateAt(frame);
            box = scene.canvas.children[0] as Rect;
        }
        return velocityOf(box!);
    }

    it("reads the same velocity however the playhead got to the frame", () => {
        const target = 30;
        const stepped = velocityAfter([28, 29, target]);
        const jumped = velocityAfter([target]);
        const fromAhead = velocityAfter([55, target]);
        const fromFarBehind = velocityAfter([1, target]);

        expect(jumped).toBeCloseTo(stepped, 5);
        expect(fromAhead).toBeCloseTo(stepped, 5);
        expect(fromFarBehind).toBeCloseTo(stepped, 5);
    });

    it("keeps reading the same velocity when the frame is asked for twice", () => {
        // Holding on a frame used to collapse dt to zero and take the blur away.
        const { driver } = slideDriver(2);
        const scene = createDrivenScene(driver);
        const evaluator = evaluatorFor(scene, 60);
        evaluator.stateAt(30);
        const first = velocityOf(scene.canvas.children[0] as Rect);
        evaluator.stateAt(31);
        evaluator.stateAt(30);
        const again = velocityOf(scene.canvas.children[0] as Rect);
        expect(again).toBeCloseTo(first, 5);
    });

    it("measures the velocity the animation actually has", () => {
        // 90px over 2s is 45px/s, and the ramp is linear, so any frame inside it
        // should read that — not a number derived from how fast the seek was.
        expect(velocityAfter([30])).toBeCloseTo(45, 1);
    });

    it("reads the first frame as stationary rather than inventing a jump", () => {
        // There is no frame before it to difference against.
        expect(velocityAfter([0])).toBe(0);
    });
});
