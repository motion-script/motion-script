import { describe, it, expect } from 'vitest';
import { StateEvaluator } from '@/runtime/state-evaluator';
import {
    FakeScene,
    FakeMeasureScope,
    FakeRenderContext,
    FakeAssetCatalog,
    asScenes,
    asCatalog,
    asRenderContext,
} from './runtime.fixtures';

const VIEWPORT = { width: 100, height: 50 };
const FPS = 4; // dt = 0.25 → clean global-time arithmetic
const catalog = asCatalog(new FakeAssetCatalog());
const scope = new FakeMeasureScope();

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
        // Per-frame motion sampling lives in Node.ellapse(); the evaluator only
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
