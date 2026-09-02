import { describe, it, expect } from "vitest";

import { PlaybackController, ControllerParams } from "@/runtime/playback-controller";
import { Precomp } from "@/runtime/precompisition";
import {
    FakeScene,
    FakeClock,
    FakeAudioDevice,
    FakeStorageAdapter,
    FakeRenderContext,
    FakeMeasurer,
    FakeAssetCatalog,
    asScenes,
    asCatalog,
    asStorage,
    asRenderContext,
    setFakeSceneFps,
} from "@/runtime/runtime.fixtures";

/**
 * What happens to a scene added to a controller that is already running.
 *
 * **An unmeasured scene does not fail to draw; it draws its neighbour.** It sits
 * in the timeline as a zero-length placeholder, so its `startFrame` is also the
 * *next* scene's, and every frame at or past it belongs to that next one. That
 * is invisible while a project is loading — the background pass fills the holes
 * in behind the first frame — and permanent afterwards, because the pass was
 * started once, in the constructor, and a reconciled list is not a new
 * controller. Adding a scene and clicking it therefore showed the scene after
 * it, until some unrelated edit happened to hot-replace it.
 *
 * Two guarantees, and the pair is what makes the seek land: the scene the
 * playhead is on is measured **before** `setScenes` returns, and everything past
 * it streams in behind the paint exactly as it does at mount.
 */

const FPS = 10;
const VIEWPORT = { width: 100, height: 50 };
setFakeSceneFps(FPS);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeController(scenes: FakeScene[]) {
    for (const scene of scenes) scene.fps = FPS;
    const clock = new FakeClock();
    const measurer = new FakeMeasurer();
    const catalog = asCatalog(new FakeAssetCatalog());
    const list = asScenes(scenes);

    const controller = new PlaybackController({
        renderContext: asRenderContext(new FakeRenderContext()),
        measurer,
        storageAdapter: asStorage(new FakeStorageAdapter()),
        masterClock: clock,
        audioDevice: new FakeAudioDevice(),
        assets: catalog,
        precomposition: new Precomp(list, VIEWPORT, FPS, catalog, measurer),
        fps: FPS,
        viewport: VIEWPORT,
        scenes: list,
    } as unknown as ControllerParams);

    return { controller, clock };
}

describe("PlaybackController.setScenes", () => {
    it("measures the scene the playhead is on before it returns", async () => {
        const a = new FakeScene({ id: "a", yieldCount: 10 });
        const b = new FakeScene({ id: "b", yieldCount: 10 });
        const { controller, clock } = makeController([a, b]);
        await flush();
        expect(controller.tracks).toEqual([10, 10]);

        // Park the playhead inside the second scene, then insert a new one ahead
        // of it — the timeline under the playhead has moved.
        clock.setTime(1.2);
        expect(controller.currentFrame).toBe(12);

        const inserted = new FakeScene({ id: "c", yieldCount: 6 });
        inserted.fps = FPS;
        controller.setScenes(asScenes([a, inserted, b]));

        // Synchronously, with no yield in between: frame 12 has to name a real
        // scene the instant the caller asks, because the repaint `setScenes`
        // schedules is for that frame.
        expect(controller.tracks.slice(0, 2)).toEqual([10, 6]);

        controller.dispose();
    });

    it("streams the rest in behind the paint, without a new controller", async () => {
        const a = new FakeScene({ id: "a", yieldCount: 10 });
        const b = new FakeScene({ id: "b", yieldCount: 10 });
        const { controller } = makeController([a, b]);
        await flush();

        // Appended *past* the playhead, so `measureThrough` deliberately does not
        // touch it — this is the half the restarted background pass owns.
        const appended = new FakeScene({ id: "c", yieldCount: 4 });
        appended.fps = FPS;
        controller.setScenes(asScenes([a, b, appended]));
        expect(controller.tracks).toEqual([10, 10, 0]);

        await flush();
        await flush();

        expect(controller.tracks).toEqual([10, 10, 4]);
        expect(controller.totalFrames).toBe(24);

        controller.dispose();
    });
});
