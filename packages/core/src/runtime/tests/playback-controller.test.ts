import { describe, it, expect, vi } from 'vitest';
import { PlaybackController, ControllerParams } from '@/runtime/playback-controller';
import { Precomp } from '@/runtime/precompisition';
import { Rect } from '@/nodes/geometry/rect-node';
import { createScene } from '@/nodes/scene/scene-node';
import { createRef } from '@/util/reference';
import {
    FakeScene,
    FakeNode,
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
} from '@/runtime/runtime.fixtures';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeController(yieldCount = 10, fps = 10, replayBudgetMs?: number) {
    const child = new FakeNode('child', 'Rect');
    const scene = new FakeScene({ id: 'root', name: 'Scene', yieldCount, children: [child] });
    const clock = new FakeClock();
    const audio = new FakeAudioDevice();
    const storage = new FakeStorageAdapter();
    const rc = new FakeRenderContext();
    const viewport = { width: 100, height: 50 };
    const scenes = asScenes([scene]);
    const measurer = new FakeMeasurer();
    const catalog = asCatalog(new FakeAssetCatalog());

    const controller = new PlaybackController({
        renderContext: asRenderContext(rc),
        measurer,
        storageAdapter: asStorage(storage),
        masterClock: clock,
        audioDevice: audio,
        assets: catalog,
        precomposition: new Precomp(scenes, viewport, fps, catalog, measurer),
        fps,
        viewport,
        scenes,
        replayBudgetMs,
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

    it('a superseded seek does not render after a newer seek resolves', async () => {
        // Fast scrub: seek(5) parks on the warm re-render loop while seek(2) runs
        // to completion. When seek(5) wakes, its generation is stale, so it must
        // bail before re-rendering — otherwise frame 5 would paint over frame 2
        // (the bug: a Video scene's frame bleeding into a later scene).
        const { controller, clock, storage, rc } = makeController(10, 10);

        // Park the first seek's warm loop on a deferred that wants another render.
        let releaseWarm!: (more: boolean) => void;
        storage.warmGate = new Promise<boolean>((res) => { releaseWarm = res; });

        const stale = controller.seek(5);   // renders frame 5 once, then parks on warmGate
        await flush();                       // let it reach the parked warmPendingVideo
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.5, 6);

        // Newer seek completes immediately (no warm gate) and is the last render.
        storage.warmGate = null;
        await controller.seek(2);
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.2, 6);
        const rendersAfterCurrentSeek = rc.renderCount;

        // Wake the stale seek and ask it to re-render — it must refuse.
        releaseWarm(true);
        await stale;

        expect(rc.renderCount).toBe(rendersAfterCurrentSeek); // no stale frame-5 repaint
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.2, 6);   // playhead stays at the newest target
    });

    it('a seek superseded mid-replay never paints its frame', async () => {
        // The scrub case. replayBudgetMs 0 makes the state replay yield on every
        // frame, so the second seek genuinely lands while the first is mid-flight
        // — the situation the synchronous replay could never expose, because
        // nothing could run to bump the generation while it held the thread.
        const { controller, clock, scene, rc } = makeController(60, 10, 0);

        // Land deep in the scene so seeking back is a real replay-from-zero.
        await controller.seek(50);
        const rendersBefore = rc.renderCount;
        const scenerendersBefore = scene.renderCount;

        // Two backward seeks issued back to back, as a fast drag would.
        const stale = controller.seek(5);
        const winner = controller.seek(2);
        await Promise.all([stale, winner]);

        // Exactly one of the two painted, and the surviving position is the newer.
        expect(rc.renderCount).toBe(rendersBefore + 1);
        expect(scene.renderCount).toBe(scenerendersBefore + 1);
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.2, 6);
    });
});

describe('PlaybackController – render paths load before they paint', () => {
    // Every paint waits for the frame's assets. Reaching for an unloaded one
    // throws rather than skipping the layer, so a path that painted first and
    // loaded after is not merely showing a worse frame — it is broken.
    it('screenshot loads before it captures', async () => {
        const { controller, rc } = makeController(10, 10);
        const rendersBefore = rc.renderCount;
        const url = await controller.screenshot();
        expect(rc.renderCount).toBe(rendersBefore + 1);
        expect(url).toBe('data:image/png;base64,FAKE');
    });

    it('replaceScene does not paint before its assets are loaded', async () => {
        // It used to repaint synchronously "for a no-flash swap of what's already
        // warm". That holds only when the swap introduces nothing new; when it
        // does, the frame is missing its media for the whole fetch — and the
        // canvas keeping the previous *complete* frame is strictly better.
        const { controller, rc } = makeController(10, 10);
        const rendersBefore = rc.renderCount;
        const edited = new FakeScene({
            id: 'root', name: 'Scene', yieldCount: 10,
            children: [new FakeNode('child', 'Rect')],
        });

        expect(controller.replaceScene(asScene(edited))).toBe(0);
        expect(rc.renderCount).toBe(rendersBefore);

        await controller.whenReplaced();
        expect(rc.renderCount).toBe(rendersBefore + 1);
    });

    it('a clock tick renders once its assets resolve, with no extra yield', async () => {
        // The controller registers its onTick handler in its constructor, so the
        // clock alone is enough to drive it here.
        const { clock, rc } = makeController(10, 10);
        const rendersBefore = rc.renderCount;
        await clock.simulateTick(0.3);
        expect(rc.renderCount).toBe(rendersBefore + 1);
    });
});

describe('PlaybackController – replaceScene (hot reload)', () => {
    it('loads an asset the edited scene added before it paints', async () => {
        // Initial scene tracks no assets. Hot-reload a scene that now declares a
        // new image; the controller must load it (not just swap the precomp)
        // *before* the paint, or the paint reaches for a decode that isn't there
        // and throws.
        const { controller, storage, rc } = makeController(10, 10);
        expect(storage.loadAssetCalls.some(c => c.key === 'new.png')).toBe(false);

        const edited = new FakeScene({
            id: 'root',
            name: 'Scene',
            yieldCount: 10,
            children: [new FakeNode('child', 'Rect')],
            onPrepare: (tracker) => tracker.addImage('new.png', { width: 64, height: 64 }),
        });

        const rendersBefore = rc.renderCount;
        expect(controller.replaceScene(asScene(edited))).toBe(0);

        // Nothing painted yet — that is the fix.
        expect(rc.renderCount).toBe(rendersBefore);

        await controller.whenReplaced();
        expect(storage.loadAssetCalls.some(c => c.key === 'new.png')).toBe(true);
        expect(rc.renderCount).toBe(rendersBefore + 1);
    });

    it('a seek that supersedes the hot-reload load wins (no stale repaint)', async () => {
        // replaceScene fires an async loadAt; if a seek begins before it resolves,
        // the hot-reload repaint must bail so it can't paint over the seek target.
        const { controller, clock, storage, rc } = makeController(10, 10);

        // Park ONLY the hot-reload's first load so we can interleave a seek
        // before it ends; the seek's own loadAt must resolve normally or it hangs.
        let releaseLoad!: () => void;
        const gate = new Promise<void>((res) => { releaseLoad = res; });
        const realLoad = storage.loadAsset.bind(storage);
        let gated = false;
        storage.loadAsset = (key, record) => {
            realLoad(key, record);
            if (!gated) { gated = true; return gate; }
            return Promise.resolve();
        };

        const edited = new FakeScene({
            id: 'root', name: 'Scene', yieldCount: 10,
            children: [new FakeNode('child', 'Rect')],
            onPrepare: (tracker) => tracker.addImage('new.png', { width: 64, height: 64 }),
        });
        controller.replaceScene(asScene(edited)); // parks on the gated loadAt

        await controller.seek(2); // newer generation; last to render
        const rendersAfterSeek = rc.renderCount;

        releaseLoad();           // wake the hot-reload load — it must refuse to repaint
        await flush();

        expect(rc.renderCount).toBe(rendersAfterSeek);
        expect(clock.seekCalls.at(-1)).toBeCloseTo(0.2, 6);
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
    it('returns the render context screenshot', async () => {
        const { controller, rc } = makeController();
        expect(await controller.screenshot()).toBe(rc.screenshotValue);
    });

    it('builds a nested tree state from the current scene with node lifespans', () => {
        const { controller } = makeController();
        // The precomp records each node's scene-local frame span (a 10-frame
        // scene at global offset 0 → frames 0..9), attached as absolute frames.
        expect(controller.getTreeState()).toEqual({
            id: 'root',
            path: '',
            type: 'Scene',
            startFrame: 0,
            endFrame: 9,
            children: [{ id: 'child', path: '0', type: 'Rect', startFrame: 0, endFrame: 9, children: [] }],
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

/**
 * Direct manipulation runs against the *real* scene graph — `FakeScene.canvas`
 * hands back a throwaway `FakeNode` per call, which has no layout, no transform
 * and no identity across calls, so none of this could be exercised through it.
 */
describe('PlaybackController – direct manipulation', () => {
    const FPS = 10;

    /**
     * `FakeRenderContext` implements only `execute`/`screenshot`, which is enough
     * for a `FakeScene` (it never draws). A real scene graph calls the whole
     * `RenderContext2D` surface, so stub the rest as no-ops — the geometry under
     * test comes from layout, not from anything the context returns.
     */
    function nullRenderContext(): FakeRenderContext {
        const base = new FakeRenderContext();
        return new Proxy(base, {
            get(target, prop, receiver) {
                if (prop in target) return Reflect.get(target, prop, receiver);
                return () => undefined;
            },
        });
    }

    function makeRealController() {
        const card = createRef<Rect>();
        const scene = createScene(function* (stage) {
            stage.add(
                new Rect({
                    ref: card,
                    width: 100,
                    height: 60,
                    children: [new Rect({ width: 20, height: 20 })],
                }),
            );
            // 10 frames of motion, so a replay has something to overwrite.
            yield* card().to({ x: 200 }, 1);
            for (let i = 0; i < 5; i++) yield;
        });

        const viewport = { width: 800, height: 600 };
        const scenes = [scene];
        const measurer = new FakeMeasurer();
        const catalog = asCatalog(new FakeAssetCatalog());
        const rc = nullRenderContext();
        const clock = new FakeClock();

        const controller = new PlaybackController({
            renderContext: asRenderContext(rc),
            measurer,
            storageAdapter: asStorage(new FakeStorageAdapter()),
            masterClock: clock,
            audioDevice: new FakeAudioDevice(),
            assets: catalog,
            precomposition: new Precomp(scenes, viewport, FPS, catalog, measurer),
            fps: FPS,
            viewport,
            scenes,
        } as unknown as ControllerParams);

        return { controller, card, rc, clock };
    }

    it('exposes a structural path on every tree node', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        const tree = controller.getTreeState()!;
        expect(tree.path).toBe('');
        expect(tree.children[0].path).toBe('0');
        expect(tree.children[0].children[0].path).toBe('0.0');
    });

    it('getNodeBox resolves a path to an on-screen box', async () => {
        const { controller, card } = makeRealController();
        await controller.seek(0);

        const box = controller.getNodeBox('0')!;
        expect(box.id).toBe(card().id);
        expect(box.type).toBe('Rect');
        expect(box.width).toBe(100);
        expect(box.height).toBe(60);
        expect(box.center.x).toBeCloseTo(0, 6);
        expect(box.center.y).toBeCloseTo(0, 6);
        // The nested child resolves too.
        expect(controller.getNodeBox('0.0')!.width).toBe(20);
    });

    it('getNodeBox returns null for a path the tree does not have', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        expect(controller.getNodeBox('7')).toBeNull();
        expect(controller.getNodeBox('0.9.3')).toBeNull();
    });

    it('getNodeBoxes walks the whole scene in draw order', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        expect(controller.getNodeBoxes().map(b => b.path)).toEqual(['0', '0.0']);
    });

    it('pickNode finds the node under a viewport point, and the topmost one', async () => {
        const { controller, card } = makeRealController();
        await controller.seek(0);

        // Dead centre is the inner 20×20 child, painted over its parent.
        expect(controller.pickNode({ x: 0, y: 0 })!.path).toBe('0.0');
        // Off the child but still on the card.
        expect(controller.pickNode({ x: 40, y: 0 })!.id).toBe(card().id);
        // Off both.
        expect(controller.pickNode({ x: 300, y: 0 })).toBeNull();
    });

    it('setNodeOverride moves the live node and survives a seek away and back', async () => {
        const { controller } = makeRealController();
        await controller.seek(10);
        // Frame 10 is the end of the tween, so the scene puts the card at x=200.
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(200, 6);

        controller.setNodeOverride('0', { x: -150 });
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(-150, 6);

        // A backward seek replays the generator from frame 0, which rewrites `x`
        // — the override is re-applied after every evaluation, so it still wins.
        await controller.seek(3);
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(-150, 6);
        await controller.seek(10);
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(-150, 6);
    });

    it('merges successive overrides for the same node', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        controller.setNodeOverride('0', { x: 40 });
        controller.setNodeOverride('0', { y: 25 });
        const center = controller.getNodeBox('0')!.center;
        expect(center.x).toBeCloseTo(40, 6);
        expect(center.y).toBeCloseTo(25, 6);
    });

    it('clearNodeOverrides restores the generator-authored value', async () => {
        const { controller } = makeRealController();
        await controller.seek(10);
        controller.setNodeOverride('0', { x: -150 });
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(-150, 6);

        controller.clearNodeOverrides();
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(200, 6);
    });

    it('clearNodeOverrides(path) drops only that node', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        controller.setNodeOverride('0', { x: 40 });
        controller.setNodeOverride('0.0', { x: 10 });

        controller.clearNodeOverrides('0.0');
        expect(controller.getNodeBox('0')!.center.x).toBeCloseTo(40, 6);
        // The child is back on its parent's centre (its own x reset to 0).
        expect(controller.getNodeBox('0.0')!.center.x).toBeCloseTo(40, 6);
    });

    it('repaint renders the current frame without advancing it', async () => {
        const { controller, rc, clock } = makeRealController();
        await controller.seek(4);
        const before = rc.renderCount;
        const time = clock.currentTime;

        controller.repaint();

        expect(rc.renderCount).toBe(before + 1);
        expect(clock.currentTime).toBe(time);
        expect(controller.currentFrame).toBe(4);
    });

    // A host adjusts the surface and the view the moment its container measures,
    // which is before the mount seek has loaded anything. Painting there drew a
    // frame with no pixels behind its media fills — an AssetNotLoadedError on
    // open, about an asset that was loading fine. The seek in flight is the first
    // real frame; there is nothing for a repaint to preserve until it lands.
    it('repaint draws nothing until a frame has been rendered', async () => {
        const { controller, rc } = makeRealController();
        expect(rc.renderCount).toBe(0);

        controller.repaint();
        controller.repaint();

        expect(rc.renderCount).toBe(0);

        // …and it goes back to painting the moment a real frame has landed.
        await controller.seek(0);
        const after = rc.renderCount;
        controller.repaint();
        expect(rc.renderCount).toBe(after + 1);
    });

    it('an override on a stale path is silently ignored', async () => {
        const { controller } = makeRealController();
        await controller.seek(0);
        expect(() => controller.setNodeOverride('9.9', { x: 1 })).not.toThrow();
        expect(controller.getNodeBox('0')!.center.x).toBe(0);
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
