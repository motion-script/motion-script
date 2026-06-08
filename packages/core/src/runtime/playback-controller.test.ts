import { describe, it, expect, vi } from 'vitest';
import { PlaybackController, ControllerParams } from '@/runtime/playback-controller';
import {
    FakeScene,
    FakeNode,
    FakeClock,
    FakeAudioDevice,
    FakeStorageAdapter,
    FakeRenderContext,
    FakeMeasureScope,
    FakeAssetCatalog,
    asScenes,
    asCatalog,
    asStorage,
    asRenderContext,
} from './runtime.fixtures';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeController(yieldCount = 10, fps = 10) {
    const child = new FakeNode('child', 'Rect');
    const scene = new FakeScene({ id: 'root', name: 'Scene', yieldCount, children: [child] });
    const clock = new FakeClock();
    const audio = new FakeAudioDevice();
    const storage = new FakeStorageAdapter();
    const rc = new FakeRenderContext();

    const controller = new PlaybackController({
        renderContext: asRenderContext(rc),
        measureScope: new FakeMeasureScope(),
        storageAdapter: asStorage(storage),
        masterClock: clock,
        audioDevice: audio,
        assets: asCatalog(new FakeAssetCatalog()),
        precomposition: undefined,
        fps,
        viewport: { width: 100, height: 50 },
        scenes: asScenes([scene]),
    } as unknown as ControllerParams);

    return { controller, scene, clock, audio, storage, rc, child };
}

describe('PlaybackController – construction', () => {
    it('derives tracks, totals, and configures the clock duration', () => {
        const { controller, clock } = makeController(10, 10);
        expect(controller.tracks).toEqual([10]);
        expect(controller.totalFrames).toBe(10);
        expect(controller.totalDuration).toBeCloseTo(1, 6);
        expect(clock.duration).toBeCloseTo(1, 6);
    });

    it('reports currentFrame as clock time × fps', () => {
        const { controller, clock } = makeController(10, 10);
        clock.setTime(0.5);
        expect(controller.currentFrame).toBe(5);
    });
});

describe('PlaybackController – seek', () => {
    it('pauses, seeks the clock, and renders the frame', async () => {
        const { controller, clock, scene, rc } = makeController();
        await controller.seek(5);

        expect(clock.isPlaying).toBe(false);
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.5, 6); // 5 / 10 fps
        expect(rc.renderCount).toBeGreaterThanOrEqual(1);
        expect(scene.renderCount).toBeGreaterThanOrEqual(1);
    });

    it('clamps a negative target to frame 0', async () => {
        const { controller, clock } = makeController();
        await controller.seek(-3);
        expect(clock.seekCalls.at(-1)).toBe(0);
    });

    it('clamps a target past the end to totalFrames', async () => {
        const { controller, clock } = makeController(10, 10);
        await controller.seek(99999);
        expect(clock.seekCalls.at(-1)).toBeCloseTo(1, 6); // 10 / 10 fps
    });
});

describe('PlaybackController – play / pause wiring', () => {
    it('starts the clock and forwards play to the audio device', () => {
        const { controller, clock, audio } = makeController();
        clock.setTime(0);
        controller.play(2, true);

        expect(clock.isPlaying).toBe(true);
        expect(audio.playCalls.at(-1)).toEqual({ time: 0, speed: 2, reverse: true });
    });

    it('stops audio on pause and fires user pause listeners', () => {
        const { controller, audio } = makeController();
        const onPause = vi.fn();
        controller.onPause(onPause);
        controller.pause();

        expect(audio.stopCount).toBeGreaterThanOrEqual(1);
        expect(onPause).toHaveBeenCalled();
    });

    it('restarts from the beginning when play() is called at the end', async () => {
        const { controller, clock } = makeController(10, 10);
        clock.setTime(1); // currentFrame = 10 = totalFrames
        controller.play();
        await flush();
        expect(clock.seekCalls).toContain(0);
    });

    it('forwards time updates to user onTime listeners', () => {
        const { controller, clock } = makeController();
        const onTime = vi.fn();
        controller.onTime(onTime);
        clock.setTime(0.3);
        expect(onTime).toHaveBeenCalledWith(0.3);
    });
});

describe('PlaybackController – tick loop', () => {
    it('syncs audio and renders on each tick within the timeline', async () => {
        const { controller, clock, audio, rc } = makeController(10, 10);
        void controller;
        const before = rc.renderCount;
        await clock.simulateTick(0.5); // frame 5 (< total)

        expect(audio.syncToCalls).toContain(0.5);
        expect(rc.renderCount).toBeGreaterThan(before);
        expect(clock.isPlaying).toBe(false); // not auto-paused mid-timeline
    });

    it('pauses automatically once the tick reaches the final frame', async () => {
        const { controller, clock, audio } = makeController(10, 10);
        void controller;
        await clock.simulateTick(1.0); // frame 10 = totalFrames → pause

        expect(clock.isPlaying).toBe(false);
        expect(audio.syncToCalls).toContain(1.0);
    });
});

describe('PlaybackController – screenshot & introspection', () => {
    it('returns the render context screenshot', () => {
        const { controller, rc } = makeController();
        expect(controller.screenshot()).toBe(rc.screenshotValue);
    });

    it('builds a nested tree state from the current scene with node lifespans', () => {
        const { controller } = makeController();
        // The precomp records each node's scene-local frame span (a 10-frame
        // scene at global offset 0 → frames 0..9), attached as absolute frames.
        expect(controller.getTreeState()).toEqual({
            id: 'root',
            type: 'Scene',
            startFrame: 0,
            endFrame: 9,
            children: [{ id: 'child', type: 'Rect', startFrame: 0, endFrame: 9, children: [] }],
        });
    });

    it('returns a node state for a known id', () => {
        const { controller } = makeController();
        expect(controller.getNodeState('child')).toEqual({
            id: 'child',
            type: 'Rect',
            properties: {},
        });
    });

    it('returns null for an unknown node id', () => {
        const { controller } = makeController();
        expect(controller.getNodeState('does-not-exist')).toBeNull();
    });
});

describe('PlaybackController – dispose', () => {
    it('tears down the clock, audio device, and scenes', () => {
        const { controller, clock, audio, scene } = makeController();
        controller.dispose();
        expect(clock.disposeCount).toBe(1);
        expect(audio.stopCount).toBeGreaterThanOrEqual(1); // audioDevice.dispose() → stop()
        expect(scene.disposeCount).toBeGreaterThanOrEqual(1);
    });

    it('does not render when an in-flight seek resolves after dispose', async () => {
        // StrictMode double-mount / HMR: a seek() started on a controller that is
        // then disposed must not render into the now-freed surface.
        const { controller, rc } = makeController();
        const renders = rc.renderCount;

        const pending = controller.seek(5); // awaits loadAt internally
        controller.dispose();               // surface freed before the await resolves
        await pending;

        expect(rc.renderCount).toBe(renders); // no late render
    });

    it('seek is a no-op once disposed', async () => {
        const { controller, rc } = makeController();
        controller.dispose();
        const renders = rc.renderCount;
        await controller.seek(3);
        expect(rc.renderCount).toBe(renders);
    });

    it('does not render on a tick that completes after dispose', async () => {
        const { controller, clock, rc } = makeController(10, 10);
        void controller;
        const renders = rc.renderCount;
        const tick = clock.simulateTick(0.5); // awaits loadAt internally
        controller.dispose();
        await tick;
        expect(rc.renderCount).toBe(renders);
    });
});
