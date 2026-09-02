import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { Precomp } from "@/runtime/precompisition";
import { Rect } from "@/nodes/geometry/rect-node";
import { Node2D } from "@/nodes/2d/node2d";
import { createRef, Reference } from "@/util/reference";
import { createScene } from "@/nodes/scene/scene-node";
import { BoxBounds } from "@/attributes/layout/bounds";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "@/runtime/runtime.fixtures";

/**
 * Regression: an animated `removeChildAt` (and any lifecycle helper that seeds a
 * tween from post-layout state) must reproduce forward playback when reached by
 * a **backward scrub**.
 *
 * `removeChildAtAnimated` pins the removing child's box to its laid-out
 * `measuredWidth`/`measuredHeight` before shrinking it. That value is only fresh
 * after a layout pass. Real-time forward playback lays out once per frame, so
 * the pin is correct. A backward seek, however, replays the scene from frame 0
 * to the target in a single `stateAt` call — and before the fix that replay ran
 * the generator frame-by-frame with **no layout between frames**, so the pin
 * read a stale/zero `layoutBounds` and the shrink diverged from forward playback.
 *
 * `StateEvaluator` now lays out before each generator step (matching precomp),
 * so the two paths must agree. This test drives a real Scene through the real
 * precomp + evaluator pipeline and compares the removing child's laid-out width
 * at a mid-remove frame, reached forward vs. via a backward seek.
 */

const VIEWPORT = { width: 800, height: 400 };
const FPS = 10; // dt = 0.1s
const scope = new FakeMeasurer();
const catalog = () => asCatalog(new FakeAssetCatalog());

const TILE = 200;
const REMOVE_DURATION = 1.0; // seconds → 10 frames of shrink

/** A probe leaf that surfaces its laid-out box for assertions. */
class Probe extends Node2D {
    get rect(): BoxBounds {
        return this.layoutBounds;
    }
}

/**
 * A row of three fixed-size tiles that, after a beat, animates the removal of
 * the middle tile. The `victim` ref lets the test read the removing child's
 * laid-out width on any frame.
 */
function scrubScene(victim: Reference<Probe>) {
    return chainScene((stage) => {
        const row = createRef<Rect>();
        stage.add(
            new Rect({
                ref: row,
                width: "hug",
                height: "fill",
                flow: "horizontal",
                gap: 24,
                align: "centerLeft",
                children: [
                    new Probe({ width: TILE, height: TILE }),
                    new Probe({ ref: victim, width: TILE, height: TILE }),
                    new Probe({ width: TILE, height: TILE }),
                ],
            }),
        );
    }, [
        // Hold a few frames so the row is fully laid out before the remove begins.
        5 / FPS,
        () => row().removeChildAt(1, REMOVE_DURATION),
        // Tail so the timeline extends past the remove.
        5 / FPS,
    ]);
}

function makeEvaluator(scene: ReturnType<typeof createScene>) {
    const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), scope).run();
    const tracks = precomp.scenes.map((s) => s.frameCount);
    return new StateEvaluator([scene], VIEWPORT, FPS, catalog(), tracks, scope);
}

/** Lay out then read the victim's current laid-out width at `frame`. */
function widthAt(ev: StateEvaluator, frame: number, victim: Reference<Probe>): number {
    ev.stateAt(frame);
    ev.layout(scope);
    return victim().rect.width;
}

describe("backward scrub — animated removeChildAt reproduces forward playback", () => {
    // The remove starts after the 5-frame hold (frame 5) and runs 10 frames, so
    // the shrink spans frames ~5–15. Pick a frame partway through the shrink.
    const MID_REMOVE = 11;

    it("the removing child is mid-shrink at the same frame whether reached forward or backward", () => {
        const fwdVictim = createRef<Probe>();
        const fwd = makeEvaluator(scrubScene(fwdVictim));
        // Forward: single-step up to the target, laying out each frame (real-time
        // playback order).
        let forwardWidth = 0;
        for (let f = 0; f <= MID_REMOVE; f++) {
            forwardWidth = widthAt(fwd, f, fwdVictim);
        }

        const bwdVictim = createRef<Probe>();
        const bwd = makeEvaluator(scrubScene(bwdVictim));
        // Land past the target first, then scrub *backward* to it — the single
        // replay-from-zero path the bug lived in.
        widthAt(bwd, 25, bwdVictim);
        const backwardWidth = widthAt(bwd, MID_REMOVE, bwdVictim);

        // Both must show the child genuinely mid-shrink — strictly between its
        // full size and 0. (Before the fix the backward path read a stale pin and
        // the width was wrong here.)
        expect(forwardWidth).toBeGreaterThan(0);
        expect(forwardWidth).toBeLessThan(TILE);

        // And the two paths must land on the *same* width for the same frame.
        expect(backwardWidth).toBeCloseTo(forwardWidth, 5);
    });

    it("a full backward replay matches forward frame-for-frame across the whole shrink", () => {
        const fwdVictim = createRef<Probe>();
        const fwd = makeEvaluator(scrubScene(fwdVictim));
        const forward: number[] = [];
        for (let f = 0; f <= 20; f++) forward.push(widthAt(fwd, f, fwdVictim));

        const bwdVictim = createRef<Probe>();
        const bwd = makeEvaluator(scrubScene(bwdVictim));
        // Jump to the end, then scrub backward one frame at a time — every step
        // that lands earlier than the generator's position triggers a fresh
        // replay-from-zero.
        widthAt(bwd, 20, bwdVictim);
        for (let f = 20; f >= 0; f--) {
            const w = widthAt(bwd, f, bwdVictim);
            expect(w).toBeCloseTo(forward[f], 5);
        }
    });
});
