import { describe, it, expect } from 'vitest';
import { Precomp, PrecompResult, createPrecompProfile } from '@/runtime/precompisition';
import { StateEvaluator } from '@/runtime/state-evaluator';
import { PlaybackController, ControllerParams } from '@/runtime/playback-controller';
import {
    FakeScene,
    FakeClock,
    FakeAudioDevice,
    FakeStorageAdapter,
    FakeRenderContext,
    FakeMeasurer,
    FakeAssetCatalog,
    asScene,
    asScenes,
    asCatalog,
    asStorage,
    asRenderContext,
    makeAudioRequest,
} from '@/runtime/runtime.fixtures';
import { setFakeSceneFps } from '@/runtime/runtime.fixtures';

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;
// Every FakeScene in this file states its length in frames; this is the rate
// the runtime under test converts that back from.
setFakeSceneFps(FPS);
const scope = new FakeMeasurer();

const flush = () => new Promise((r) => setTimeout(r, 0));

function precompOf(scenes: FakeScene[], catalog = new FakeAssetCatalog()) {
    return new Precomp(asScenes(scenes), VIEWPORT, FPS, asCatalog(catalog), scope);
}

/** Three scenes of distinct lengths, so ordering mistakes show up as wrong offsets. */
function trio() {
    return [
        new FakeScene({ id: 'a', name: 'A', yieldCount: 3 }),
        new FakeScene({ id: 'b', name: 'B', yieldCount: 7 }),
        new FakeScene({ id: 'c', name: 'C', yieldCount: 5 }),
    ];
}

describe('Precomp – incremental measurement', () => {
    it('runAsync yielding every frame produces exactly what run() produces', async () => {
        const sync = precompOf(trio()).run();
        // budgetMs 0 forces a yield after every single frame — the most adversarial
        // interleaving the time-sliced driver can produce.
        const async_ = await precompOf(trio()).runAsync({ budgetMs: 0 });

        expect(async_).toEqual(sync);
        expect(async_.complete).toBe(true);
    });

    it('memoizes each scene, so a second ensureScene never re-drives the generator', () => {
        const scenes = trio();
        const precomp = precompOf(scenes);

        const first = precomp.ensureScene(1);
        const second = precomp.ensureScene(1);

        expect(second).toBe(first);
        expect(scenes[1].buildCount).toBe(1);
        // Measuring scene 1 on demand must not have touched its neighbours.
        expect(scenes[0].buildCount).toBe(0);
        expect(scenes[2].buildCount).toBe(0);
    });

    it('runUntil stops early, leaving later scenes unmeasured', () => {
        const scenes = trio();
        const result = precompOf(scenes).runUntil((i) => i === 0);

        expect(result.scenes.map((s) => s.measured)).toEqual([true, false, false]);
        expect(result.complete).toBe(false);
        // A placeholder contributes no frames, so the known total covers scene 0 only.
        expect(result.totalFrames).toBe(3);
        expect(scenes[1].buildCount).toBe(0);
        expect(scenes[2].buildCount).toBe(0);
    });

    it('publishes a growing timeline, one scene at a time', async () => {
        const published: PrecompResult[] = [];
        const final = await precompOf(trio()).runAsync({
            budgetMs: 0,
            onProgress: (r) => published.push(r),
        });

        expect(published).toHaveLength(3);
        expect(published.map((r) => r.totalFrames)).toEqual([3, 10, 15]);
        expect(published.map((r) => r.complete)).toEqual([false, false, true]);
        // Offsets are re-derived on every publish, so each one is self-consistent.
        expect(published[1].scenes.map((s) => s.startFrame)).toEqual([0, 3, 10]);
        expect(final.totalFrames).toBe(15);
    });

    it('re-resolves an open audio bed as later scenes extend the project', async () => {
        // A bed opened in scene 0 that outlives it: `endAt` is resolved against the
        // project total, which is still growing while precomp runs. Each publish must
        // re-derive it rather than compound a stale value.
        //
        // Built fresh per pass — FakeScene's onPrepare frame index is its cumulative
        // prepare count, so a scene that has already been driven never sees frame 0 again.
        const withBed = () => [
            new FakeScene({
                id: 'a', yieldCount: 3,
                onPrepare: (t, f) => {
                    if (f === 0) t.addAudioRequest(makeAudioRequest({
                        id: 'bed', src: 'bed.mp3', startAt: 0, endAt: 0, open: true, mediaDuration: 60,
                    }));
                },
            }),
            new FakeScene({ id: 'b', yieldCount: 7 }),
            new FakeScene({ id: 'c', yieldCount: 5 }),
        ];

        const published: PrecompResult[] = [];
        await precompOf(withBed()).runAsync({ budgetMs: 0, onProgress: (r) => published.push(r) });

        // The bed is capped at the project end, which grows 0.3s → 1.0s → 1.5s.
        const bedEnd = (r: PrecompResult) => r.scenes[0].audioRequests[0].endAt;
        expect(bedEnd(published[0])).toBeCloseTo(0.3, 6);
        expect(bedEnd(published[1])).toBeCloseTo(1.0, 6);
        expect(bedEnd(published[2])).toBeCloseTo(1.5, 6);
        // And the end state matches what a single synchronous pass would have produced.
        expect(bedEnd(published[2])).toBeCloseTo(bedEnd(precompOf(withBed()).run()), 6);
    });

    it('cancelling between scenes stops before the next one is even started', async () => {
        const scenes = trio();
        let cancelled = false;
        const result = await precompOf(scenes).runAsync({
            budgetMs: 0,
            isCancelled: () => cancelled,
            onProgress: () => { cancelled = true; },   // trip as soon as scene 0 lands
        });

        expect(result.scenes.map((s) => s.measured)).toEqual([true, false, false]);
        expect(result.complete).toBe(false);
        expect(scenes[1].buildCount).toBe(0);
        expect(scenes[2].buildCount).toBe(0);
    });

    it('cancelling mid-scene resets the scene it abandoned and leaves it unmeasured', async () => {
        let cancelled = false;
        const scenes = [
            new FakeScene({ id: 'a', yieldCount: 2 }),
            // Long enough that it cannot finish; trips the cancel partway through.
            new FakeScene({ id: 'b', yieldCount: 500, onPrepare: (_t, f) => { if (f === 3) cancelled = true; } }),
            new FakeScene({ id: 'c', yieldCount: 5 }),
        ];
        const result = await precompOf(scenes).runAsync({ budgetMs: 0, isCancelled: () => cancelled });

        expect(result.scenes.map((s) => s.measured)).toEqual([true, false, false]);
        expect(result.complete).toBe(false);
        // Scene 1 was abandoned mid-pass: its `finally` must still have run, so the
        // scene is reset (setup reset + teardown reset) rather than left torn at a
        // partial frame — and it stopped where it was cancelled, not at frame 500.
        expect(scenes[1].buildCount).toBe(1);
        expect(scenes[1].resetCount).toBe(2);
        expect(scenes[1].prepareCount).toBeLessThan(10);
        expect(scenes[2].buildCount).toBe(0);
    });

    it('replaceScene re-runs only the edited scene and reuses the rest', async () => {
        const scenes = trio();
        const precomp = precompOf(scenes);
        const before = await precomp.runAsync({ budgetMs: 0 });

        const replacement = new FakeScene({ id: 'b2', name: 'B', yieldCount: 11 });
        const after = precomp.replaceScene(before, 1, asScene(replacement));

        expect(after.scenes.map((s) => s.frameCount)).toEqual([3, 11, 5]);
        expect(after.scenes.map((s) => s.startFrame)).toEqual([0, 3, 14]);
        expect(after.complete).toBe(true);
        // Untouched scenes keep their cached passes — neither is re-driven.
        expect(scenes[0].buildCount).toBe(1);
        expect(scenes[2].buildCount).toBe(1);
        expect(replacement.buildCount).toBe(1);
    });

    it('collects a per-phase timing breakdown when a profile is injected', async () => {
        const profile = createPrecompProfile();
        const result = await new Precomp(
            asScenes(trio()), VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), scope, { profile },
        ).runAsync({ budgetMs: 0 });

        expect(result.timings).toHaveLength(3);
        expect(result.timings?.[1]).toMatchObject({ sceneName: 'B', sceneIndex: 1, frameCount: 7 });
        // Every phase the loop walks is accounted for, and parked time is excluded —
        // budgetMs 0 yields between every frame, so a leak there would dwarf the total.
        const t = result.timings![1]!;
        expect(Object.keys(t.phases)).toContain('layout');
        expect(t.totalMs).toBeGreaterThanOrEqual(0);
        expect(t.totalMs).toBeLessThan(1000);
    });
});

describe('StateEvaluator – scenes that have not been measured yet', () => {
    it('never drives a scene the precomp pass has not reached', () => {
        const scenes = trio();
        // Only scene 0 measured; the rest are zero-length placeholders.
        const evaluator = new StateEvaluator(asScenes(scenes), VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), [3, 0, 0], scope);

        // Past the end of everything known. The old fallback returned the *last*
        // slot, which would reset and drive an unmeasured scene out from under the
        // background precomp — the collision the sequential invariant forbids.
        evaluator.stateAt(999);

        expect(scenes[1].buildCount).toBe(0);
        expect(scenes[2].buildCount).toBe(0);
        expect(evaluator.currentScene as unknown).toBe(scenes[0]);
    });

    it('setTracks grows the timeline without dropping replay progress', () => {
        const scenes = trio();
        const evaluator = new StateEvaluator(asScenes(scenes), VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), [3, 0, 0], scope);

        evaluator.stateAt(2);
        const buildsAfterFirstSeek = scenes[0].buildCount;

        evaluator.setTracks([3, 7, 5]);
        // Re-evaluating the same frame must not have reset and rebuilt scene 0.
        evaluator.stateAt(2);
        expect(scenes[0].buildCount).toBe(buildsAfterFirstSeek);

        // And the freshly-measured scenes are now addressable at the right offsets:
        // with tracks [3, 7, 5] scene 1 spans frames 3–9 and scene 2 spans 10–14.
        evaluator.stateAt(5);
        expect(evaluator.currentScene as unknown).toBe(scenes[1]);
        evaluator.stateAt(11);
        expect(evaluator.currentScene as unknown).toBe(scenes[2]);
    });
});

describe('PlaybackController – progressive precomp', () => {
    function makeController(scenes: FakeScene[], precompBudgetMs = 0) {
        const clock = new FakeClock();
        const storage = new FakeStorageAdapter();
        const rc = new FakeRenderContext();
        const catalog = asCatalog(new FakeAssetCatalog());
        const asScenesList = asScenes(scenes);

        let resolveComplete!: (r: PrecompResult) => void;
        const complete = new Promise<PrecompResult>((r) => { resolveComplete = r; });

        const controller = new PlaybackController({
            renderContext: asRenderContext(rc),
            measurer: scope,
            storageAdapter: asStorage(storage),
            masterClock: clock,
            audioDevice: new FakeAudioDevice(),
            assets: catalog,
            precomposition: new Precomp(asScenesList, VIEWPORT, FPS, catalog, scope),
            fps: FPS,
            viewport: VIEWPORT,
            scenes: asScenesList,
            precompBudgetMs,
            onPrecompProgress: (r: PrecompResult) => { if (r.complete) resolveComplete(r); },
        } as unknown as ControllerParams);

        return { controller, clock, complete };
    }

    it('measures only the first scene up front, then streams in the rest', async () => {
        const scenes = trio();
        const { controller, clock, complete } = makeController(scenes);

        // Synchronously after construction only scene 0 has been driven, so the
        // first frame can paint without waiting on the whole project.
        expect(scenes[0].buildCount).toBe(1);
        expect(scenes[1].buildCount).toBe(0);
        expect(scenes[2].buildCount).toBe(0);
        expect(controller.totalFrames).toBe(3);
        expect(controller.precomp.complete).toBe(false);

        await complete;

        expect(controller.tracks).toEqual([3, 7, 5]);
        expect(controller.totalFrames).toBe(15);
        expect(controller.precomp.complete).toBe(true);
        // The clock's duration tracks the growing timeline, not the initial slice.
        expect(clock.duration).toBeCloseTo(1.5, 6);
    });

    it('dispose() abandons a precomp still in flight', async () => {
        const scenes = [
            new FakeScene({ id: 'a', yieldCount: 2 }),
            new FakeScene({ id: 'b', yieldCount: 2000 }),
            new FakeScene({ id: 'c', yieldCount: 5 }),
        ];
        const { controller } = makeController(scenes);

        await flush();
        controller.dispose();
        for (let i = 0; i < 5; i++) await flush();

        expect(controller.precomp.complete).toBe(false);
        // Scene 2 is behind a 2000-frame scene that yields every frame — a run that
        // ignored the cancel would still be grinding through scene 1, so the real
        // assertion is that nothing kept driving after dispose.
        expect(scenes[2].buildCount).toBe(0);
        const buildsAtDispose = scenes[1].buildCount;
        for (let i = 0; i < 5; i++) await flush();
        expect(scenes[1].buildCount).toBe(buildsAtDispose);
    });
});
