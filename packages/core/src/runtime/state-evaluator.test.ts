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
    const evaluator = new StateEvaluator(asScenes([scene]), VIEWPORT, FPS, catalog, [yieldCount]);
    return { scene, evaluator };
}

describe('StateEvaluator – construction', () => {
    it('sizes every scene to the viewport and selects the first as current', () => {
        const a = new FakeScene({ id: 'a', yieldCount: 5 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [5, 5]);

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
});

describe('StateEvaluator – multi-scene timeline', () => {
    function pair() {
        const a = new FakeScene({ id: 'a', yieldCount: 10 });
        const b = new FakeScene({ id: 'b', yieldCount: 5 });
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [10, 5]);
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
        evaluator.layout(scope);
        expect(scene.layoutCalls).toHaveLength(1);
        expect(scene.layoutCalls[0].rect).toEqual({ x: 0, y: 0, width: 100, height: 50 });
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
        const evaluator = new StateEvaluator(asScenes([a, b]), VIEWPORT, FPS, catalog, [5, 5]);
        evaluator.dispose();
        expect(a.disposeCount).toBe(1);
        expect(b.disposeCount).toBe(1);
    });
});
