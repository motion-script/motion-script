import { describe, it, expect, vi } from 'vitest';
import { AssetManager } from '@/assets/manager';
import {
    FakeStorageAdapter,
    FakeAudioDevice,
    asStorage,
    makePrecompResult,
    makeScenePrecomp,
    makeAssetTrack,
    makeImageRecord,
    makeLoaderRecord,
    makeAudioRequest,
} from '../runtime/runtime.fixtures';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(precomp = makePrecompResult({ scenes: [] })) {
    const storage = new FakeStorageAdapter();
    const audio = new FakeAudioDevice();
    const mgr = new AssetManager(precomp, asStorage(storage), audio);
    return { mgr, storage, audio };
}

describe('AssetManager.loadAt', () => {
    const assets = new Map([
        ['a', makeAssetTrack({ cacheAt: 0, record: makeImageRecord({ src: 'a', endFrame: 10 }) })],
        ['b', makeAssetTrack({ cacheAt: 20, record: makeImageRecord({ src: 'b', endFrame: 30 }) })],
        ['c', makeAssetTrack({ cacheAt: 0, record: makeImageRecord({ src: 'c', endFrame: 2 }) })],
    ]);

    it('loads only assets whose [cacheAt, endFrame] window contains the frame', async () => {
        const { mgr, storage } = setup(makePrecompResult({ assets, scenes: [] }));
        await mgr.loadAt(5);
        expect(storage.loadAssetCalls.map((c) => c.key)).toEqual(['a']);
    });

    it('loads an asset whose cacheAt window has just opened', async () => {
        const { mgr, storage } = setup(makePrecompResult({ assets, scenes: [] }));
        await mgr.loadAt(25); // a: endFrame 10 < 25 (out); b: cacheAt20<=25, endFrame30>=25 (in); c: out
        expect(storage.loadAssetCalls.map((c) => c.key)).toEqual(['b']);
    });

    it('resolves with no work when nothing is in range', async () => {
        const { mgr, storage } = setup(makePrecompResult({ assets, scenes: [] }));
        await mgr.loadAt(15); // a out (10<15), b not yet (20>15), c out
        expect(storage.loadAssetCalls).toHaveLength(0);
    });
});

describe('AssetManager.prefetch', () => {
    it('fires loads for in-window assets without awaiting', () => {
        const assets = new Map([
            ['a', makeAssetTrack({ cacheAt: 0, record: makeImageRecord({ src: 'a', endFrame: 10 }) })],
        ]);
        const { mgr, storage } = setup(makePrecompResult({ assets, scenes: [] }));
        mgr.prefetch(5);
        expect(storage.loadAssetCalls.map((c) => c.key)).toEqual(['a']);
    });

    it('swallows load rejections (logs instead of throwing)', async () => {
        const assets = new Map([
            ['a', makeAssetTrack({ cacheAt: 0, record: makeImageRecord({ src: 'a', endFrame: 10 }) })],
        ]);
        const { mgr, storage } = setup(makePrecompResult({ assets, scenes: [] }));
        storage.loadShouldReject = true;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => mgr.prefetch(5)).not.toThrow();
        await flush();
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});

describe('AssetManager loaders', () => {
    it('runs a loader callback when its window opens and awaits it in loadAt', async () => {
        const load = vi.fn(async () => () => { });
        const assets = new Map([
            ['L', makeAssetTrack({ cacheAt: 0, discardAt: 10, record: makeLoaderRecord({ src: 'L', load }) })],
        ]);
        const { mgr } = setup(makePrecompResult({ assets, scenes: [] }));

        await mgr.loadAt(5);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not run a loader before its cacheAt window', async () => {
        const load = vi.fn(async () => () => { });
        const assets = new Map([
            ['L', makeAssetTrack({ cacheAt: 20, discardAt: 30, record: makeLoaderRecord({ src: 'L', load }) })],
        ]);
        const { mgr } = setup(makePrecompResult({ assets, scenes: [] }));

        await mgr.loadAt(5);
        expect(load).not.toHaveBeenCalled();
    });

    it('runs a loader at most once across repeated in-window frames', async () => {
        const load = vi.fn(async () => () => { });
        const assets = new Map([
            ['L', makeAssetTrack({ cacheAt: 0, discardAt: 100, record: makeLoaderRecord({ src: 'L', load }) })],
        ]);
        const { mgr } = setup(makePrecompResult({ assets, scenes: [] }));

        await mgr.loadAt(1);
        await mgr.loadAt(2);
        mgr.prefetch(3);
        await flush();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('disposes a loaded loader once the frame leaves its window', async () => {
        const dispose = vi.fn();
        const load = vi.fn(async () => dispose);
        const assets = new Map([
            ['L', makeAssetTrack({ cacheAt: 0, discardAt: 10, record: makeLoaderRecord({ src: 'L', load }) })],
        ]);
        const { mgr } = setup(makePrecompResult({ assets, scenes: [] }));

        await mgr.loadAt(5);
        expect(dispose).not.toHaveBeenCalled();

        await mgr.loadAt(50); // past discardAt → evicted
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('runs all disposers on dispose()', async () => {
        const dispose = vi.fn();
        const assets = new Map([
            ['L', makeAssetTrack({ cacheAt: 0, discardAt: 10, record: makeLoaderRecord({ src: 'L', load: async () => dispose }) })],
        ]);
        const { mgr } = setup(makePrecompResult({ assets, scenes: [] }));

        await mgr.loadAt(5);
        mgr.dispose();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});

describe('AssetManager.syncAudio', () => {
    function precompWith(requests: ReturnType<typeof makeAudioRequest>[], startFrame = 0, fps = 10) {
        return makePrecompResult({
            fps,
            scenes: [makeScenePrecomp({ startFrame, audioRequests: requests })],
        });
    }

    it('schedules and retains a request that falls within the look-ahead window', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 0, endAt: 1 });
        const { mgr, audio, storage } = setup(precompWith([req]));

        mgr.syncAudio(0);

        expect(audio.scheduleCalls).toHaveLength(1);
        expect(audio.scheduleCalls[0][0].src).toBe('s1');
        expect(audio.retainCalls).toHaveLength(1);
        expect([...audio.retainCalls[0]]).toEqual(['s1']);
        // Not yet cached → triggers a fetch.
        expect(storage.fetchAudioCalls).toEqual(['s1']);
    });

    it('rewrites request timing into global (scene-offset) seconds', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 1, endAt: 2 });
        // Scene starts at frame 10 (= 1s at 10fps), so global start = 1 + 1 = 2s.
        const { mgr, audio } = setup(precompWith([req], 10, 10));
        mgr.syncAudio(20); // currentTime = 2s
        const scheduled = audio.scheduleCalls[0][0];
        expect(scheduled.startAt).toBeCloseTo(2, 6);
        expect(scheduled.endAt).toBeCloseTo(3, 6);
    });

    it('excludes requests that have already ended', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 0, endAt: 1 });
        const { mgr, audio } = setup(precompWith([req]));
        mgr.syncAudio(50); // currentTime = 5s, request ended at 1s
        expect(audio.scheduleCalls).toHaveLength(0);
    });

    it('excludes requests more than 10s beyond the current time', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 100, endAt: 101 });
        const { mgr, audio } = setup(precompWith([req]));
        mgr.syncAudio(0);
        expect(audio.scheduleCalls).toHaveLength(0);
    });

    it('does not fetch audio data already cached on the device', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 0, endAt: 1 });
        const { mgr, audio, storage } = setup(precompWith([req]));
        audio.seed('s1');
        mgr.syncAudio(0);
        expect(storage.fetchAudioCalls).toHaveLength(0);
    });

    it('does not reschedule when the active window is unchanged', () => {
        const req = makeAudioRequest({ id: 'r1', src: 's1', startAt: 0, endAt: 1 });
        const { mgr, audio } = setup(precompWith([req]));
        mgr.syncAudio(0);
        mgr.syncAudio(0); // identical window
        expect(audio.scheduleCalls).toHaveLength(1);
        expect(audio.retainCalls).toHaveLength(1);
    });

    it('reschedules and re-retains when the window changes', () => {
        const r1 = makeAudioRequest({ id: 'r1', src: 's1', startAt: 0, endAt: 1 });
        const r2 = makeAudioRequest({ id: 'r2', src: 's2', startAt: 20, endAt: 21 });
        const { mgr, audio } = setup(precompWith([r1, r2]));
        mgr.syncAudio(0);   // window = [r1] (r2 too far ahead)
        mgr.syncAudio(150); // window = [r2] (r1 ended, r2 now near)
        expect(audio.scheduleCalls).toHaveLength(2);
        expect(audio.scheduleCalls[1][0].src).toBe('s2');
        expect(audio.retainCalls).toHaveLength(2);
    });

    it('deduplicates identical requests emitted by multiple scenes', () => {
        const shared = makeAudioRequest({ id: 'dup', src: 's1', startAt: 0, endAt: 1 });
        const precomp = makePrecompResult({
            fps: 10,
            scenes: [
                makeScenePrecomp({ startFrame: 0, audioRequests: [{ ...shared }] }),
                makeScenePrecomp({ startFrame: 0, audioRequests: [{ ...shared }] }),
            ],
        });
        const { mgr, audio } = setup(precomp);
        mgr.syncAudio(0);
        expect(audio.scheduleCalls[0]).toHaveLength(1);
    });
});
