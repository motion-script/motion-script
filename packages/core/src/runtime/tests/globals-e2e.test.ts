import { describe, it, expect } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";

import { AssetManager } from "@/assets/manager";
import { Node2D } from "@/nodes/2d/node2d";
import { Image } from "@/nodes/media/image-node";
import { Rect } from "@/nodes/geometry/rect-node";
import type { Scene } from "@/nodes/scene/scene-node";
import { RenderContext2D } from "@/render/render-context2d";
import { NullRenderContext } from "@/render/null-render-context";
import { Precomp } from "@/runtime/precompisition";
import { ProjectGlobals } from "@/runtime/globals";
import { StateEvaluator } from "@/runtime/state-evaluator";
import {
    asCatalog,
    asStorage,
    FakeAssetCatalog,
    FakeAudioDevice,
    FakeMeasurer,
    FakeStorageAdapter,
} from "@/runtime/runtime.fixtures";

/**
 * The project-level globals — audio beds, backgrounds and overlays — driven
 * through the **real** pipeline: `Precomp` measuring, `StateEvaluator` playing
 * back, `AssetManager` scheduling.
 *
 * `globals.test.ts` proves the units in isolation; this proves they are actually
 * wired into the per-frame loop — that a layer's assets are discovered while
 * measuring, that a layer draws on the right side of the scene, and that a bed
 * is re-bounded as the timeline grows.
 */

const VIEWPORT = { width: 800, height: 400 };
const FPS = 10;
const scope = new FakeMeasurer();
const catalog = (durations: Record<string, number> = {}) => asCatalog(new FakeAssetCatalog(durations));

/** A leaf that appends its label to a shared log as it draws. */
class Probe extends Node2D {
    constructor(private readonly log: string[], private readonly label: string) {
        super({ width: 10, height: 10 });
    }
    protected override renderSelf(_ctx: RenderContext2D): void {
        this.log.push(this.label);
    }
}

/** A scene of `frames` frames whose single child logs when it draws. */
function probeScene(log: string[], label: string, frames: number): Scene {
    const s = chainScene((stage) => {
        stage.add(new Probe(log, label));
    }, [
        frames / FPS,
    ]);
    s.name = label;
    return s;
}

describe("global layers – precomp", () => {
    it("discovers a layer's assets, spanning every scene it is active on", () => {
        const scenes = [probeScene([], "intro", 3), probeScene([], "outro", 3)];
        const globals = new ProjectGlobals({
            overlays: [() => new Image({ src: "watermark.png", width: 64, height: 64 })],
        }, VIEWPORT);
        const result = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, { globals }).run();

        const track = result.assets.get("watermark.png");
        expect(track).toBeDefined();
        // Present on every frame of both scenes, so its window covers the timeline.
        expect(track!.record.startFrame).toBe(0);
        expect(track!.record.endFrame).toBe(result.totalFrames - 1);
    });

    it("confines a filtered layer's asset window to the scenes it appears on", () => {
        const scenes = [probeScene([], "intro", 3), probeScene([], "outro", 4)];
        const globals = new ProjectGlobals({
            overlays: [{ node: () => new Image({ src: "watermark.png", width: 64, height: 64 }), include: "outro" }],
        }, VIEWPORT);
        const result = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, { globals }).run();

        const record = result.assets.get("watermark.png")!.record;
        // Only the second scene draws it: frames 3..6 of a 7-frame timeline.
        expect(record.startFrame).toBe(3);
        expect(record.endFrame).toBe(6);
    });

    it("leaves the asset map untouched when the project declares no layers", () => {
        const scenes = [probeScene([], "intro", 3)];
        const withGlobals = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, {
            globals: new ProjectGlobals({}, VIEWPORT),
        }).run();
        const without = new Precomp([probeScene([], "intro", 3)], VIEWPORT, FPS, catalog(), scope).run();
        expect([...withGlobals.assets.keys()]).toEqual([...without.assets.keys()]);
        expect(withGlobals.totalFrames).toBe(without.totalFrames);
    });
});

describe("global audio beds – precomp", () => {
    it("bounds a bed by the project total and re-resolves it as scenes land", async () => {
        const scenes = [probeScene([], "a", 10), probeScene([], "b", 10)];
        const globals = new ProjectGlobals({ audioTracks: [{ src: "music.mp3", loop: true }] }, VIEWPORT);
        const precomp = new Precomp(scenes, VIEWPORT, FPS, catalog({ "music.mp3": 3 }), scope, { globals });

        // Only the first scene measured: the bed is bounded by that partial total.
        const partial = precomp.runUntil(i => i === 0);
        expect(partial.complete).toBe(false);
        expect(partial.globalAudio[0].endAt).toBe(partial.totalDuration);

        const full = await precomp.runAsync();
        expect(full.complete).toBe(true);
        // Re-derived, not carried over — a longer project means a longer bed.
        expect(full.globalAudio[0].endAt).toBe(full.totalDuration);
        expect(full.totalDuration).toBeGreaterThan(partial.totalDuration);
    });

    it("surfaces a bad track as a build error attributed to the project, not a scene", () => {
        const globals = new ProjectGlobals({ audioTracks: [{ src: "music.mp3", trimStart: 9, trimEnd: 1 }] }, VIEWPORT);
        const result = new Precomp([probeScene([], "a", 3)], VIEWPORT, FPS, catalog(), scope, { globals }).run();

        expect(result.globalAudio).toEqual([]);
        expect(result.buildErrors).toHaveLength(1);
        expect(result.buildErrors[0].sceneIndex).toBeLessThan(0);
        // Re-assembling must not accumulate a second copy of the same error.
        expect(new Precomp([probeScene([], "a", 3)], VIEWPORT, FPS, catalog(), scope, { globals }).run().buildErrors)
            .toHaveLength(1);
    });

    it("is empty for a project that declares no beds", () => {
        const result = new Precomp([probeScene([], "a", 3)], VIEWPORT, FPS, catalog(), scope).run();
        expect(result.globalAudio).toEqual([]);
    });
});

describe("global layers – playback", () => {
    /** Drive a real evaluator to `frame` and return the draw order it produced. */
    function drawAt(evaluator: StateEvaluator, log: string[], frame: number): string[] {
        log.length = 0;
        evaluator.stateAt(frame);
        evaluator.layout(scope);
        const ctx = new NullRenderContext();
        ctx.execute(() => evaluator.render(ctx));
        return [...log];
    }

    function setup(overlayFilter?: { include?: string }) {
        const log: string[] = [];
        const scenes = [probeScene(log, "intro", 4), probeScene(log, "outro", 4)];
        const globals = new ProjectGlobals({
            backgrounds: [() => new Probe(log, "bg")],
            overlays: [overlayFilter ? { node: () => new Probe(log, "fg"), ...overlayFilter } : () => new Probe(log, "fg")],
        }, VIEWPORT);
        const precomp = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, { globals }).run();
        const evaluator = new StateEvaluator(
            scenes, VIEWPORT, FPS, catalog(), precomp.scenes.map(s => s.frameCount), scope, globals,
        );
        return { evaluator, log };
    }

    it("draws backgrounds under the scene and overlays over it", () => {
        const { evaluator, log } = setup();
        expect(drawAt(evaluator, log, 0)).toEqual(["bg", "intro", "fg"]);
    });

    it("keeps the same order after a scene cut and after a backward scrub", () => {
        const { evaluator, log } = setup();
        expect(drawAt(evaluator, log, 5)).toEqual(["bg", "outro", "fg"]);
        // A backward seek replays the scene from its frame 0; the layers must
        // still bracket it rather than being dropped or duplicated.
        expect(drawAt(evaluator, log, 1)).toEqual(["bg", "intro", "fg"]);
    });

    it("re-selects the active layers when the playhead crosses into another scene", () => {
        const { evaluator, log } = setup({ include: "outro" });
        expect(drawAt(evaluator, log, 0)).toEqual(["bg", "intro"]);
        expect(drawAt(evaluator, log, 5)).toEqual(["bg", "outro", "fg"]);
        expect(drawAt(evaluator, log, 0)).toEqual(["bg", "intro"]);
    });

    it("advances layers on the project clock, so they don't restart at a cut", () => {
        const log: string[] = [];
        let probe!: Probe;
        const scenes = [probeScene(log, "intro", 4), probeScene(log, "outro", 4)];
        const globals = new ProjectGlobals({
            backgrounds: [() => (probe = new Probe(log, "bg"))],
        }, VIEWPORT);
        const precomp = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, { globals }).run();
        const evaluator = new StateEvaluator(
            scenes, VIEWPORT, FPS, catalog(), precomp.scenes.map(s => s.frameCount), scope, globals,
        );

        evaluator.stateAt(5);
        // Frame 5 is the second frame of scene 2, but the layer's clock is global.
        expect(probe.time.total).toBeCloseTo(5 / FPS, 5);
    });
});

describe("AssetManager – global audio scheduling", () => {
    it("schedules a project bed at absolute time, alongside the scenes' own audio", async () => {
        const scenes = [probeScene([], "a", 10), probeScene([], "b", 10)];
        const globals = new ProjectGlobals({ audioTracks: [{ src: "music.mp3", startAt: 1 }] }, VIEWPORT);
        const precomp = new Precomp(scenes, VIEWPORT, FPS, catalog({ "music.mp3": 0.6 }), scope, { globals }).run();

        const audio = new FakeAudioDevice();
        const manager = new AssetManager(precomp, asStorage(new FakeStorageAdapter()), audio);
        // Frame 10 is inside the *second* scene, whose offset is 1s. A bed shifted
        // by that offset would land at [2, 2.6) instead of [1, 1.6).
        await manager.loadAt(10);

        const scheduled = audio.scheduleCalls.at(-1)!;
        expect(scheduled).toHaveLength(1);
        expect(scheduled[0].src).toBe("music.mp3");
        expect(scheduled[0].startAt).toBeCloseTo(1, 5);
        expect(scheduled[0].endAt).toBeCloseTo(1.6, 5);
    });

    it("fetches the bed's audio data even though no scene references it", async () => {
        const globals = new ProjectGlobals({ audioTracks: [{ src: "music.mp3" }] }, VIEWPORT);
        const precomp = new Precomp([probeScene([], "a", 10)], VIEWPORT, FPS, catalog({ "music.mp3": 1 }), scope, { globals }).run();

        const storage = new FakeStorageAdapter();
        const manager = new AssetManager(precomp, asStorage(storage), new FakeAudioDevice());
        await manager.loadAt(0);
        expect(storage.fetchAudioCalls).toContain("music.mp3");
    });
});

describe("global layers – rebuild per runtime", () => {
    it("draws again on a second mount, from a fresh tree", () => {
        const log: string[] = [];
        const scenes = [probeScene(log, "a", 3)];
        const mount = () => {
            const globals = new ProjectGlobals({ overlays: [() => new Probe(log, "fg")] }, VIEWPORT);
            const precomp = new Precomp(scenes, VIEWPORT, FPS, catalog(), scope, { globals }).run();
            return new StateEvaluator(
                scenes, VIEWPORT, FPS, catalog(), precomp.scenes.map(s => s.frameCount), scope, globals,
            );
        };

        mount().dispose();

        // Second mount (StrictMode double-mount / HMR): the layer must still draw.
        const evaluator = mount();
        evaluator.stateAt(0);
        evaluator.layout(scope);
        log.length = 0;
        const ctx = new NullRenderContext();
        ctx.execute(() => evaluator.render(ctx));
        expect(log).toEqual(["a", "fg"]);
    });

    it("refuses a node handed in where a factory belongs", () => {
        expect(() => new ProjectGlobals({ backgrounds: [new Rect({ width: 10, height: 10 })] }, VIEWPORT))
            .toThrow(/factory, not a node/);
    });
});
