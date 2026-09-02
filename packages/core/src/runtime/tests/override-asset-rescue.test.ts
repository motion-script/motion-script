import { describe, it, expect } from "vitest";

import { PlaybackController, ControllerParams } from "@/runtime/playback-controller";
import { Precomp } from "@/runtime/precompisition";
import { AssetNotLoadedError } from "@/assets/errors";
import { Rect } from "@/nodes/geometry/rect-node";
import { createRef } from "@/util/reference";
import { chainScene } from "@/runtime/scene.fixtures";
import {
    FakeClock,
    FakeAudioDevice,
    FakeStorageAdapter,
    FakeMeasurer,
    FakeAssetCatalog,
    asCatalog,
    asStorage,
    asRenderContext,
} from "@/runtime/runtime.fixtures";

/**
 * A frame that reaches for an asset no measuring pass ever declared.
 *
 * The asset timeline is built from what the precomp *saw*, and the tree that
 * draws is not only what the precomp saw: {@link PlaybackController.setNodeOverride}
 * writes straight onto live signals. A host previewing an edit can therefore put
 * a picture on a node no pass has named — which is exactly what choosing an
 * image fill in an inspector does, because the rebuild that would declare it is
 * held while the edit is open. Nothing opens a window, nothing loads the
 * picture, and the draw throws `AssetNotLoadedError`.
 *
 * Reporting that is honest and useless: the fault is curable, and the error says
 * which source to cure it with. So the controller loads it and paints again, and
 * the host hears about it only if the load fails too.
 *
 * Attaching an existing library image was the shape that showed it. Uploading a
 * *new* one hid it, because a new asset changes the manifest and a new manifest
 * rebuilds the whole controller — which re-measures every scene and declares the
 * picture along the way.
 */

const FPS = 10;
const VIEWPORT = { width: 800, height: 600 };
const SRC = "late.png";

/**
 * A render context that draws nothing until told to fail, then throws the error
 * a media fill throws when its decode is missing.
 *
 * Standing in for the fill itself: what is under test is the controller's
 * response to that throw, and building a real image fill would drag a decoder
 * into a test about error handling.
 */
class ThrowingRenderContext {
    renderCount = 0;
    /** Set false once the "load" has happened, as a real fill would behave. */
    missing = true;
    pixelRatio = 1;
    view = { zoom: 1, x: 0, y: 0 };
    frame: unknown = null;
    clipToFrame = true;

    execute(_draw: () => void): void {
        this.renderCount++;
        // The draw is never run: what is under test is the controller's response
        // to a media fill's throw, and this stands in for the whole pass. Throwing
        // in its place puts the failure exactly where a missing decode raises it.
        if (this.missing) throw new AssetNotLoadedError("image", SRC);
    }
    mount(): void { }
    dispose(): void { }
    resize(): void { }
    beginFrame(): void { }
    endFrame(): void { }
    snapshot(): string { return ""; }
}

function makeController(storage: FakeStorageAdapter, rc: ThrowingRenderContext) {
    const card = createRef<Rect>();
    const scene = chainScene((stage) => {
        stage.add(new Rect({ ref: card, width: 100, height: 60 }));
    }, [5 / FPS]);

    const scenes = [scene];
    const measurer = new FakeMeasurer();
    // The catalog knows the picture; only the measured pass does not. That is the
    // whole shape of the bug — the source is resolvable, it simply was never
    // declared, so nothing ever opened a window over it.
    const catalog = asCatalog(new FakeAssetCatalog());

    const controller = new PlaybackController({
        renderContext: asRenderContext(rc as never),
        measurer,
        storageAdapter: asStorage(storage),
        masterClock: new FakeClock(),
        audioDevice: new FakeAudioDevice(),
        assets: catalog,
        precomposition: new Precomp(scenes, VIEWPORT, FPS, catalog, measurer),
        fps: FPS,
        viewport: VIEWPORT,
        scenes,
    } as unknown as ControllerParams);

    return controller;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a frame that draws an asset nothing declared", () => {
    it("loads it and repaints instead of reporting it", async () => {
        const storage = new FakeStorageAdapter();
        const rc = new ThrowingRenderContext();
        const controller = makeController(storage, rc);
        const reported: unknown[] = [];
        controller.onRenderError = (errors) => reported.push(...errors);
        // Loading it is what makes it drawable, so the fake says so — otherwise
        // the repaint would find it missing again and this would be a test about
        // an asset that genuinely isn't there.
        const load = storage.loadAsset.bind(storage);
        storage.loadAsset = (key, record) => {
            if (key === SRC) rc.missing = false;
            return load(key, record);
        };

        await controller.seek(0);
        await flush();

        // The source the frame asked for was fetched, by name.
        const rescue = storage.loadAssetCalls.find((call) => call.key === SRC);
        expect(rescue).toBeDefined();
        expect(rescue!.record).toMatchObject({ type: "image", src: SRC });
        // …and the frame was drawn again once it had landed.
        expect(rc.renderCount).toBeGreaterThan(1);

        // Nothing reported: the failure was cured, not announced.
        expect(reported).toEqual([]);
        expect(controller.buildErrors).toEqual([]);

        controller.dispose();
    });

    it("tries each source once, however many frames ask for it", async () => {
        const storage = new FakeStorageAdapter();
        const rc = new ThrowingRenderContext();
        const controller = makeController(storage, rc);

        await controller.seek(0);
        await flush();
        // Still missing, so every one of these throws again. A rescue per frame
        // would be a fetch loop under a scrub.
        await controller.seek(1);
        await controller.seek(2);
        await flush();

        expect(storage.loadAssetCalls.filter((call) => call.key === SRC)).toHaveLength(1);

        controller.dispose();
    });

    it("reports the original failure when the load cannot fix it either", async () => {
        const storage = new FakeStorageAdapter();
        storage.loadShouldReject = true;
        const rc = new ThrowingRenderContext();
        const controller = makeController(storage, rc);
        const reported: string[] = [];
        controller.onRenderError = (errors) => {
            reported.length = 0;
            reported.push(...errors.map((e) => e.message));
        };

        await controller.seek(0);
        await flush();
        await flush();

        expect(reported.some((m) => m.includes(SRC))).toBe(true);
        expect(reported.some((m) => m.includes("Loading it directly also failed"))).toBe(true);

        controller.dispose();
    });
});
