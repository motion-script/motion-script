import { describe, it, expect } from 'vitest';
import { StateEvaluator } from '@/runtime/state-evaluator';
import {
    FakeScene,
    FakeMeasurer,
    FakeRenderContext,
    FakeAssetCatalog,
    asScenes,
    asCatalog,
    asRenderContext,
} from './runtime.fixtures';

const VIEWPORT = { width: 100, height: 50 };
const FPS = 4; // dt = 0.25 → clean global-time arithmetic
const catalog = asCatalog(new FakeAssetCatalog());
const scope = new FakeMeasurer();

function single(yieldCount = 10) {
    const scene = new FakeScene({ id: 'a', yieldCount });
    const evaluator = new StateEvaluator(asScenes([scene]), VIEWPORT, FPS, catalog, [yieldCount], scope);
    return { scene, evaluator };
}

describe('StateEvaluator – construction', () => {
    it('sizes every scene to the viewport and selects the first as current', () => {
        const a = new FakeScene({ id: 'a', yieldCount: 5 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [5, 5], scope);

        expect(a.setCalls).toEqual([{ width: 100, height: 50 }]);
        expect(b.setCalls).toEqual([{ width: 100, height: 50 }]);
        expect(evaluator.currentFrame).toBe(0);
        expect(evaluator.currentScene as unknown).toBe(a);
    });
});

describe('StateEvaluator – priming & forward advance', () => {
    it('primes the slot on the first stateAt without advancing past frame 0', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(0);
        expect(scene.resetCount).toBe(1);
        expect(scene.buildCount).toBe(1);
        expect(scene.ellapseCalls).toEqual([0]); // only resetSlot's ellapse(0)
        expect(evaluator.currentFrame).toBe(0);
    });

    it('advances the generator one step per frame with increasing global time', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        // resetSlot ellapse(0) + advances at frames 1,2,3 → times 0.25, 0.5, 0.75.
        expect(scene.ellapseCalls).toEqual([0, 0.25, 0.5, 0.75]);
        expect(evaluator.currentFrame).toBe(3);
    });

    it('is a no-op when asked for the frame it is already on', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        const ellapsedBefore = scene.ellapseCalls.length;
        evaluator.stateAt(3);
        expect(scene.ellapseCalls.length).toBe(ellapsedBefore);
    });

    it('floors fractional frames and clamps negatives to 0', () => {
        const { evaluator } = single();
        evaluator.stateAt(2.9);
        expect(evaluator.currentFrame).toBe(2);
        evaluator.stateAt(-5);
        expect(evaluator.currentFrame).toBe(0);
    });
});

describe('StateEvaluator – backward seek', () => {
    it('resets and replays the slot when seeking earlier within a scene', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.resetCount).toBe(1);
        expect(scene.buildCount).toBe(1);

        evaluator.stateAt(1);
        expect(scene.resetCount).toBe(2); // re-primed
        expect(scene.buildCount).toBe(2);
        expect(evaluator.currentFrame).toBe(1);
    });

    it('seeds the sampling history when priming a slot', () => {
        // Per-frame motion sampling lives in Node2D.ellapse(); the evaluator only
        // has to seed the freshly-built frame-0 nodes (ellapse(0) runs before
        // build()), so a forward step differentiates against a real prior frame.
        const { scene, evaluator } = single();
        evaluator.stateAt(3); // one prime (resetSlot) → one seed sample()
        expect(scene.sampleCount).toBe(1);
        evaluator.stateAt(1); // backward seek re-primes → seeds again
        expect(scene.sampleCount).toBe(2);
    });
});

describe('StateEvaluator – abortable seek', () => {
    it('stops the replay loop early and does not advance currentFrame when cancelled', () => {
        const { scene, evaluator } = single(60);
        // Cancel once 3 frames have been advanced (resetSlot ellapse(0) + 3 steps).
        let advanced = 0;
        evaluator.stateAt(50, () => {
            // Predicate is polled at the top of each iteration, before the step.
            return advanced++ >= 3;
        });
        // ellapse(0) from resetSlot, then frames 1,2,3 advanced before the 4th
        // poll tripped the cancel → 4 ellapse calls total, loop bailed at frame 3.
        expect(scene.ellapseCalls).toEqual([0, 0.25, 0.5, 0.75]);
        // currentFrame must NOT have moved to 50 — the seek was abandoned.
        expect(evaluator.currentFrame).toBe(0);
    });

    it('completes the seek when the predicate never cancels', () => {
        const { evaluator } = single(60);
        evaluator.stateAt(50, () => false);
        expect(evaluator.currentFrame).toBe(50);
    });

    it('replays cleanly to a backward target after a prior seek was aborted', () => {
        const { scene, evaluator } = single(60);
        // Land fully on frame 40 first.
        evaluator.stateAt(40, () => false);
        expect(evaluator.currentFrame).toBe(40);
        const buildsAfterFirst = scene.buildCount;

        // Abort a backward seek to 5 partway through its replay-from-zero.
        let advanced = 0;
        evaluator.stateAt(5, () => advanced++ >= 2);
        expect(evaluator.currentFrame).toBe(40); // unchanged — aborted
        // The abort reset the slot (backward seek), so a build happened…
        expect(scene.buildCount).toBe(buildsAfterFirst + 1);

        // A fresh, uncancelled backward seek to 10 must land exactly on 10.
        evaluator.stateAt(10, () => false);
        expect(evaluator.currentFrame).toBe(10);
    });
});

describe('StateEvaluator – multi-scene timeline', () => {
    function pair() {
        const a = new FakeScene({ id: 'a', yieldCount: 10 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [10, 5], scope);
        return { a, b, evaluator };
    }

    it('routes a frame to the scene that owns it and lazily primes only that scene', () => {
        const { a, b, evaluator } = pair();
        evaluator.stateAt(12); // global 12 → scene B local 2
        expect(evaluator.currentScene as unknown).toBe(b);
        expect(b.buildCount).toBe(1);
        expect(a.buildCount).toBe(0); // scene A never needed
    });

    it('switches current scene back to an earlier scene and re-primes it', () => {
        const { a, evaluator } = pair();
        evaluator.stateAt(12);
        evaluator.stateAt(3); // back into scene A
        expect(evaluator.currentScene as unknown).toBe(a);
        expect(a.buildCount).toBe(1);
        expect(evaluator.currentFrame).toBe(3);
    });

    it('clamps to the last slot when seeking past the end of the timeline', () => {
        const { b, evaluator } = pair();
        evaluator.stateAt(20); // past end (last frame is 14)
        expect(evaluator.currentScene as unknown).toBe(b);
        expect(evaluator.currentFrame).toBe(20);
    });

    it('binds and ellapses only the scene being advanced', () => {
        const { a, b, evaluator } = pair();
        evaluator.stateAt(12); // global 12 → scene B local 2
        // Scene A is frozen: nothing mutates its tree while B replays, so it must
        // not be walked at all. Fanning these across every scene made a replay
        // cost O(frames × scenes) instead of O(frames).
        expect(a.ellapseCalls).toEqual([]);
        expect(a.bindAssetsCalls).toEqual([]);
        expect(a.bindContextCalls).toEqual([]);
        expect(b.ellapseCalls.length).toBeGreaterThan(0);
    });

    it("births a later-entered scene's clock at its own frame 0", () => {
        const { a, evaluator } = pair();
        evaluator.stateAt(12); // enter scene B first — A must stay untouched
        evaluator.stateAt(3);  // now enter scene A
        // A's first ellapse is its own resetSlot at t=0. If the replay fanned out
        // across scenes, B's replay would already have ellapsed A at *global*
        // time (~2.5s), and `advanceClock` seeds `creation` on first touch and
        // never re-seeds — so A's root would report a negative `elapsed` from
        // here on, for the rest of the session.
        expect(a.ellapseCalls[0]).toBe(0);
    });

    it('drives a scene on scene time, not project time', () => {
        const { b, evaluator } = pair();
        // Scene B starts at global frame 10, so its local frames 1..4 are global
        // 11..14. Its clock must read 0.25s..1.0s — its *own* elapsed time — not
        // 2.75s..3.5s, which is where it happens to sit in the project.
        evaluator.stateAt(14);
        expect(b.ellapseCalls).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('gives a scene the same clock wherever it sits in the timeline', () => {
        // The property that makes "export this scene on its own" and "export the
        // whole timeline" agree: a scene's frames may not depend on what precedes
        // it. Drive the same scene as the only scene, and as the second of two,
        // and the times it is ellapsed with must match exactly.
        const alone = new FakeScene({ id: 'x', yieldCount: 5 });
        const aloneEval = new StateEvaluator(
            asScenes([alone]), VIEWPORT, FPS, catalog, [5], scope,
        );
        aloneEval.stateAt(4);

        const lead = new FakeScene({ id: 'lead', yieldCount: 10 });
        const grouped = new FakeScene({ id: 'x', yieldCount: 5 });
        const groupedEval = new StateEvaluator(
            asScenes([lead, grouped]), VIEWPORT, FPS, catalog, [10, 5], scope,
        );
        groupedEval.stateAt(14); // the same local frame 4, ten frames along

        expect(grouped.ellapseCalls).toEqual(alone.ellapseCalls);
    });
});

describe('StateEvaluator – interruptible seek (stateAtAsync)', () => {
    it('reaches the target and reports completion', async () => {
        const { evaluator } = single(60);
        await expect(evaluator.stateAtAsync(50, () => false)).resolves.toBe(true);
        expect(evaluator.currentFrame).toBe(50);
    });

    it('abandons the replay without moving currentFrame when cancelled', async () => {
        const { evaluator } = single(60);
        let polls = 0;
        // budgetMs 0 → yields every frame, so the predicate is actually reachable.
        const reached = await evaluator.stateAtAsync(50, () => polls++ >= 3, 0);
        expect(reached).toBe(false);
        expect(evaluator.currentFrame).toBe(0);
    });

    it('lets a newer seek preempt one already in flight', async () => {
        // The regression test for the original bug. `stateAt` is synchronous, so
        // while it runs nothing can bump the generation — its cancel predicate is
        // provably always false and a long backward seek is uninterruptible. Only
        // a yielding replay makes preemption observable, which is what this pins.
        const { scene, evaluator } = single(600);
        let generation = 1;
        let polls = 0;
        let second: Promise<boolean> | null = null;

        const first = evaluator.stateAtAsync(500, () => {
            // Once the replay is genuinely under way, issue a newer seek — the
            // scrub's next mouse move. Driving it from the predicate rather than a
            // timer keeps the interleaving deterministic.
            if (++polls === 10) {
                generation = 2;
                second = evaluator.stateAtAsync(10, () => generation !== 2, 0);
            }
            return generation !== 1;
        }, 0);

        expect(await first).toBe(false);
        // It was cancelled *mid-replay*, having advanced real frames first.
        expect(scene.ellapseCalls.length).toBeGreaterThan(1);
        expect(await second!).toBe(true);
        expect(evaluator.currentFrame).toBe(10);
    });

    it('serializes queued replays so only the newest completes', async () => {
        const { scene, evaluator } = single(600);
        let generation = 0;
        const start = (frame: number) => {
            const mine = ++generation;
            return evaluator.stateAtAsync(frame, () => generation !== mine, 0);
        };

        const results = await Promise.all([start(100), start(200), start(300)]);

        expect(results).toEqual([false, false, true]);
        expect(evaluator.currentFrame).toBe(300);
        // Only the surviving replay reset the slot. Two interleaved resets would
        // both rebuild into the shared BuildStage and corrupt it.
        expect(scene.buildCount).toBe(1);
    });

    it('unwinds instead of stepping generators once disposed', async () => {
        const { evaluator } = single(600);
        const pending = evaluator.stateAtAsync(500, () => false, 0);
        evaluator.dispose(); // e.g. StrictMode double-mount / HMR teardown
        await expect(pending).resolves.toBe(false);
    });
});

describe('StateEvaluator – layout & render delegation', () => {
    it('lays out the current scene against the full viewport rect', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(1);
        // stateAt now lays out internally per advanced frame (see class doc), so
        // clear those and assert the explicit render-pass layout on its own.
        scene.layoutCalls.length = 0;
        evaluator.layout(scope);
        expect(scene.layoutCalls).toHaveLength(1);
        expect(scene.layoutCalls[0].rect).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });

    it('lays out every advanced frame during replay so generators read fresh layout', () => {
        // Priming lays out frame 0 (resetSlot), then the advance loop lays out
        // before stepping the generator at frames 1, 2, 3 → 4 internal layouts.
        // This is what keeps an animated removeChildAt (which pins to
        // measuredWidth) reproducible on a backward scrub.
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.layoutCalls).toHaveLength(4);
        for (const call of scene.layoutCalls) {
            expect(call.rect).toEqual({ x: 0, y: 0, width: 100, height: 50 });
        }
    });

    it('renders the current scene through the render context', () => {
        const { scene, evaluator } = single();
        const ctx = new FakeRenderContext();
        evaluator.stateAt(1);
        evaluator.render(asRenderContext(ctx));
        expect(scene.renderCount).toBe(1);
    });
});

describe('StateEvaluator – dispose', () => {
    it('disposes every scene', () => {
        const a = new FakeScene({ id: 'a', yieldCount: 5 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [5, 5], scope);
        evaluator.dispose();
        expect(a.disposeCount).toBe(1);
        expect(b.disposeCount).toBe(1);
    });
});
