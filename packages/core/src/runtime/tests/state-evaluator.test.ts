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
} from '@/runtime/runtime.fixtures';

const VIEWPORT = { width: 100, height: 50 };
const FPS = 4; // dt = 0.25 → clean global-time arithmetic
const catalog = asCatalog(new FakeAssetCatalog());
const scope = new FakeMeasurer();

function single(frames = 10) {
    const scene = new FakeScene({ id: 'a', yieldCount: frames });
    scene.fps = FPS;
    const evaluator = new StateEvaluator(asScenes([scene]), VIEWPORT, FPS, catalog, [frames], scope);
    return { scene, evaluator };
}

describe('StateEvaluator – construction', () => {
    it('sizes every scene to the viewport and selects the first as current', () => {
        const a = new FakeScene({ id: 'a', yieldCount: 5 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [5, 5], scope);

        expect(a.setViewportCalls).toEqual([VIEWPORT]);
        expect(b.setViewportCalls).toEqual([VIEWPORT]);
        expect(evaluator.currentFrame).toBe(0);
        expect(evaluator.currentScene as unknown).toBe(a);
    });
});

describe('StateEvaluator – building & evaluating', () => {
    it('builds the slot once on the first stateAt', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(0);
        expect(scene.resetCount).toBe(1);
        expect(scene.buildCount).toBe(1);
        expect(evaluator.currentFrame).toBe(0);
    });

    /**
     * The property the whole model exists for: reaching frame N costs one
     * evaluation, not N. A generator had to be advanced frame by frame, so the
     * scene's clock walked 0, 0.25, 0.5, 0.75 to reach frame 3.
     */
    it('evaluates the target frame directly instead of walking to it', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        // The build attaches at 0; the evaluation attaches at the target's own
        // scene time. Nothing in between.
        expect(scene.ellapseCalls).toEqual([0, 0.75]);
        expect(evaluator.currentFrame).toBe(3);
    });

    /**
     * Motion is a property of the frame, not of the seek that reached it: the
     * frame before is evaluated and stamped as history, then the frame itself.
     */
    it('evaluates the previous frame first so motion is reproducible', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.evaluateCalls).toEqual([0.5, 0.75]);
        expect(scene.primeMotionCalls).toEqual([0.5]);
    });

    it('clamps the previous frame at zero on the very first frame', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(0);
        expect(scene.evaluateCalls).toEqual([0, 0]);
        expect(scene.primeMotionCalls).toEqual([0]);
    });

    it('is a no-op when asked for the frame it is already on', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        const before = scene.evaluateCalls.length;
        evaluator.stateAt(3);
        expect(scene.evaluateCalls.length).toBe(before);
    });

    it('floors fractional frames and clamps negatives to 0', () => {
        const { evaluator } = single();
        evaluator.stateAt(2.9);
        expect(evaluator.currentFrame).toBe(2);
        evaluator.stateAt(-5);
        expect(evaluator.currentFrame).toBe(0);
    });

    it('re-evaluates after invalidate(), so an override can be written over', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        const before = scene.evaluateCalls.length;
        evaluator.invalidate();
        evaluator.stateAt(3);
        expect(scene.evaluateCalls.length).toBeGreaterThan(before);
        // Still no rebuild — invalidating drops the frame memo, not the tree.
        expect(scene.buildCount).toBe(1);
    });
});

describe('StateEvaluator – backward seek', () => {
    /**
     * The cost that went away. A generator could only be advanced, so an earlier
     * frame meant throwing the tree out and replaying from zero — which made a
     * backward scrub cost more the deeper into a scene it happened.
     */
    it('does not rebuild the scene when seeking earlier', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.buildCount).toBe(1);

        evaluator.stateAt(1);
        expect(scene.resetCount).toBe(1);
        expect(scene.buildCount).toBe(1);
        expect(evaluator.currentFrame).toBe(1);
    });

    it('costs the same backwards as forwards', () => {
        const { scene, evaluator } = single(60);
        evaluator.stateAt(50);
        const afterForward = scene.evaluateCalls.length;
        evaluator.stateAt(2);
        // Two evaluations for the frame reached, whichever direction it lay in.
        expect(scene.evaluateCalls.length - afterForward).toBe(2);
    });

    it('seeds the sampling history on build and on every evaluation', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.sampleCount).toBe(2); // build seeds once, the evaluation once
        evaluator.stateAt(1);
        expect(scene.sampleCount).toBe(3); // no rebuild, so only the evaluation
    });
});

describe('StateEvaluator – cancellation', () => {
    /**
     * Vestigial, and deliberately so. The predicate is honoured once, before any
     * work: an evaluation is a single call, so there is no longer a window in
     * which to abandon one halfway.
     */
    it('does nothing when cancelled before it starts', () => {
        const { scene, evaluator } = single(60);
        evaluator.stateAt(50, () => true);
        expect(scene.buildCount).toBe(0);
        expect(evaluator.currentFrame).toBe(0);
    });

    it('completes the seek when the predicate never cancels', () => {
        const { evaluator } = single(60);
        evaluator.stateAt(50, () => false);
        expect(evaluator.currentFrame).toBe(50);
    });
});

describe('StateEvaluator – multi-scene timeline', () => {
    function pair() {
        const a = new FakeScene({ id: 'a', yieldCount: 10 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        a.fps = FPS;
        b.fps = FPS;
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [10, 5], scope);
        return { a, b, evaluator };
    }

    it('routes a frame to the scene that owns it and lazily builds only that scene', () => {
        const { a, b, evaluator } = pair();
        evaluator.stateAt(12); // global 12 → scene B local 2
        expect(evaluator.currentScene as unknown).toBe(b);
        expect(b.buildCount).toBe(1);
        expect(a.buildCount).toBe(0); // scene A never needed
    });

    it('switches current scene back to an earlier scene and builds it then', () => {
        const { a, evaluator } = pair();
        evaluator.stateAt(12);
        evaluator.stateAt(3); // back into scene A
        expect(evaluator.currentScene as unknown).toBe(a);
        expect(a.buildCount).toBe(1);
        expect(evaluator.currentFrame).toBe(3);
    });

    it('keeps each scene built once across repeated crossings', () => {
        const { a, b, evaluator } = pair();
        evaluator.stateAt(3);
        evaluator.stateAt(12);
        evaluator.stateAt(1);
        evaluator.stateAt(13);
        expect(a.buildCount).toBe(1);
        expect(b.buildCount).toBe(1);
    });

    it('clamps to the last slot when seeking past the end of the timeline', () => {
        const { b, evaluator } = pair();
        evaluator.stateAt(20); // past end (last frame is 14)
        expect(evaluator.currentScene as unknown).toBe(b);
        expect(evaluator.currentFrame).toBe(20);
    });

    it('touches only the scene being evaluated', () => {
        const { a, b, evaluator } = pair();
        evaluator.stateAt(12); // global 12 → scene B local 2
        // Scene A is frozen: nothing mutates its tree, so it must not be walked
        // at all. Fanning these across every scene would make a seek cost
        // O(scenes) for no benefit.
        expect(a.ellapseCalls).toEqual([]);
        expect(a.attachCalls).toEqual([]);
        expect(b.ellapseCalls.length).toBeGreaterThan(0);
    });

    it("births a later-entered scene's clock at its own frame 0", () => {
        const { a, evaluator } = pair();
        evaluator.stateAt(12); // enter scene B first — A must stay untouched
        evaluator.stateAt(3);  // now enter scene A
        // A's first attach is its own build at t=0. If evaluation fanned out
        // across scenes, B's would already have attached A at *global* time
        // (~2.5s), and `advanceClock` seeds `creation` on first touch and never
        // re-seeds — so A's root would report a negative `elapsed` from here on,
        // for the rest of the session.
        expect(a.ellapseCalls[0]).toBe(0);
    });

    it('drives a scene on scene time, not project time', () => {
        const { b, evaluator } = pair();
        // Scene B starts at global frame 10, so its local frame 4 is global 14.
        // Its clock must read 1.0s — its *own* elapsed time — not 3.5s, which is
        // where it happens to sit in the project.
        evaluator.stateAt(14);
        expect(b.ellapseCalls).toEqual([0, 1]);
    });

    it('gives a scene the same clock wherever it sits in the timeline', () => {
        // The property that makes "export this scene on its own" and "export the
        // whole timeline" agree: a scene's frames may not depend on what precedes
        // it. Evaluate the same scene as the only scene, and as the second of
        // two, and the times it is asked for must match exactly.
        const alone = new FakeScene({ id: 'x', yieldCount: 5 });
        alone.fps = FPS;
        const aloneEval = new StateEvaluator(
            asScenes([alone]), VIEWPORT, FPS, catalog, [5], scope,
        );
        aloneEval.stateAt(4);

        const lead = new FakeScene({ id: 'lead', yieldCount: 10 });
        const grouped = new FakeScene({ id: 'x', yieldCount: 5 });
        lead.fps = FPS;
        grouped.fps = FPS;
        const groupedEval = new StateEvaluator(
            asScenes([lead, grouped]), VIEWPORT, FPS, catalog, [10, 5], scope,
        );
        groupedEval.stateAt(14); // the same local frame 4, ten frames along

        expect(grouped.ellapseCalls).toEqual(alone.ellapseCalls);
        expect(grouped.evaluateCalls).toEqual(alone.evaluateCalls);
    });
});

describe('StateEvaluator – stateAtAsync', () => {
    it('reaches the target and reports completion', async () => {
        const { evaluator } = single(60);
        await expect(evaluator.stateAtAsync(50, () => false)).resolves.toBe(true);
        expect(evaluator.currentFrame).toBe(50);
    });

    it('refuses a seek already superseded before it began', async () => {
        const { evaluator } = single(60);
        const reached = await evaluator.stateAtAsync(50, () => true);
        expect(reached).toBe(false);
        expect(evaluator.currentFrame).toBe(0);
    });

    it('lands on the newest of several queued seeks', async () => {
        // The scrub case. Each seek is one call, so there is no interleaving to
        // serialize any more — they simply run in order and the last one wins.
        const { scene, evaluator } = single(600);
        const results = await Promise.all([
            evaluator.stateAtAsync(100),
            evaluator.stateAtAsync(200),
            evaluator.stateAtAsync(300),
        ]);
        expect(results).toEqual([true, true, true]);
        expect(evaluator.currentFrame).toBe(300);
        expect(scene.buildCount).toBe(1);
    });

    it('refuses once disposed', async () => {
        const { evaluator } = single(600);
        evaluator.dispose(); // e.g. StrictMode double-mount / HMR teardown
        await expect(evaluator.stateAtAsync(500)).resolves.toBe(false);
    });
});

describe('StateEvaluator – layout & render delegation', () => {
    it('lays out the current scene against the full viewport rect', () => {
        const { scene, evaluator } = single();
        evaluator.stateAt(1);
        // stateAt lays out internally (see evaluateSlot), so clear those and
        // assert the explicit render-pass layout on its own.
        scene.layoutCalls.length = 0;
        evaluator.layout(scope);
        expect(scene.layoutCalls).toHaveLength(1);
        expect(scene.layoutCalls[0].rect).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });

    it('lays out both evaluated frames so motion reads a fresh box', () => {
        // The build lays out frame 0, then the evaluation lays out the previous
        // frame and the target. A node's world position is `layoutBounds + x`, so
        // reading the new `x` against the previous seek's rect would make motion
        // depend on how the playhead arrived.
        const { scene, evaluator } = single();
        evaluator.stateAt(3);
        expect(scene.layoutCalls).toHaveLength(3);
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
