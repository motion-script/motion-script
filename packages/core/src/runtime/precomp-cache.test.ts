import { describe, it, expect } from "vitest";
import {
    serializeScenePrecomp,
    deserializeScenePrecomp,
    PRECOMP_CACHE_FORMAT,
} from "@/runtime/precomp-cache";
import { Precomp, PrecompCache, ScenePrecomp } from "@/runtime/precompisition";
import { AudioFilters } from "@/attributes/audio/filters/chain";
import { ramp } from "@/attributes/audio/filters/curve";
import {
    FakeScene, FakeMeasureScope, FakeAssetCatalog, asScene, asScenes, asCatalog, makeAudioRequest,
} from "./runtime.fixtures";

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;
const scope = new FakeMeasureScope();

const precompOf = (scenes: FakeScene[], cache?: PrecompCache) =>
    new Precomp(asScenes(scenes), VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), scope, { cache });

/** A scene with a stable `__sceneHotId`, which is what makes it cacheable. */
function keyed(hotId: string, opts: ConstructorParameters<typeof FakeScene>[0] = {}) {
    const scene = new FakeScene({ id: hotId, ...opts });
    (scene as unknown as { __sceneHotId: string }).__sceneHotId = hotId;
    return scene;
}

/**
 * A scene keyed by its **content** rather than its slot, as an editor host keys
 * them — every keystroke edits the scene sitting in the same slot, so a slot key
 * would name the pre-edit measurement forever.
 */
function contentKeyed(key: string, opts: ConstructorParameters<typeof FakeScene>[0] = {}) {
    const scene = new FakeScene({ id: key, ...opts });
    (scene as unknown as { __precompKey: string }).__precompKey = key;
    return scene;
}

/**
 * Measure one scene, asserting it built cleanly.
 *
 * `precompScene` records a throwing generator as a `BuildError` and carries on,
 * so a scene whose `onPrepare` throws yields a perfectly valid *empty* pass —
 * which serializes fine and makes a broken test look green. Fail loudly instead.
 */
async function measureOne(scene: FakeScene): Promise<ScenePrecomp> {
    const result = await precompOf([scene]).runAsync();
    expect(result.buildErrors).toEqual([]);
    expect(result.scenes[0].frameCount).toBeGreaterThan(0);
    return result.scenes[0];
}

/** An in-memory PrecompCache that records what it was asked for. */
function memoryCache() {
    const entries = new Map<string, ScenePrecomp>();
    const gets: string[] = [];
    const puts: string[] = [];
    const cache: PrecompCache = {
        get: (k) => { gets.push(k); return entries.get(k); },
        put: (k, p) => { puts.push(k); entries.set(k, p); },
    };
    return { cache, entries, gets, puts };
}

describe("ScenePrecomp serialization", () => {
    it("round-trips a pass through JSON without losing anything", async () => {
        const scenes = [keyed("a.tsx", {
            yieldCount: 4,
            onPrepare: (t, f) => {
                if (f === 0) {
                    t.requestImage("img.png", 64, 48);
                    t.requestFont("Inter", "700");
                    t.addAudioRequest(makeAudioRequest({ id: "s1", src: "a.mp3", ownerPath: "0.1" }));
                }
                if (f === 2) t.requestAudio("bed.mp3");
            },
        })];
        const original = await measureOne(scenes[0]);

        const wire = serializeScenePrecomp(original);
        expect(wire).not.toBeNull();

        // Through real JSON, not a structured clone — that is the actual transport,
        // and it is where Infinity and Map would silently degrade.
        const revived = deserializeScenePrecomp(JSON.parse(JSON.stringify(wire)));
        expect(revived).not.toBeNull();

        expect(revived!.frameCount).toBe(original.frameCount);
        expect(revived!.measured).toBe(true);
        expect(revived!.audioRequests).toEqual(original.audioRequests);
        expect([...revived!.lifespans.entries()]).toEqual([...original.lifespans.entries()]);
        expect([...revived!.assetRecords.entries()]).toEqual([...original.assetRecords.entries()]);
    });

    it("preserves an untrimmed audio clip's Infinity trimEnd", async () => {
        const scenes = [keyed("a.tsx", {
            yieldCount: 2,
            onPrepare: (t, f) => { if (f === 0) t.requestAudio("bed.mp3"); },
        })];
        const original = await measureOne(scenes[0]);
        const record = original.assetRecords.get("bed.mp3");
        // Guard the premise: if the tracker stops emitting Infinity this test is moot.
        expect(record).toMatchObject({ type: "audio", trimEnd: Infinity });

        const revived = deserializeScenePrecomp(JSON.parse(JSON.stringify(serializeScenePrecomp(original))));
        expect(revived!.assetRecords.get("bed.mp3")).toMatchObject({ trimEnd: Infinity });
    });

    it("refuses to serialize a pass carrying a curve-valued audio filter", async () => {
        const scenes = [keyed("a.tsx", {
            yieldCount: 2,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: "s", src: "a.mp3",
                    filters: AudioFilters.volume(ramp(0, 1, 0.5)).list,
                }));
            },
        })];
        const original = await measureOne(scenes[0]);

        // A Curve holds EasingFunctions, which cannot come back from JSON. Refusing
        // costs one measurement; a lossy entry would silently drop the automation.
        expect(serializeScenePrecomp(original)).toBeNull();
    });

    it("still serializes a pass whose filters are all plain numbers", async () => {
        const scenes = [keyed("a.tsx", {
            yieldCount: 2,
            onPrepare: (t, f) => {
                if (f === 0) t.addAudioRequest(makeAudioRequest({
                    id: "s", src: "a.mp3", filters: AudioFilters.volume(0.5).lowpass(800).list,
                }));
            },
        })];
        const original = await measureOne(scenes[0]);
        const revived = deserializeScenePrecomp(JSON.parse(JSON.stringify(serializeScenePrecomp(original))));
        expect(revived!.audioRequests[0].filters).toEqual(original.audioRequests[0].filters);
    });

    it("rejects malformed, truncated, or foreign-format entries instead of trusting them", () => {
        const valid = {
            format: PRECOMP_CACHE_FORMAT,
            frameCount: 3,
            audioRequests: [],
            assetRecords: [],
            lifespans: [["", { startFrame: 0, endFrame: 2 }]],
        };
        expect(deserializeScenePrecomp(valid)).not.toBeNull();

        // Each of these would produce a plausible-looking but wrong timeline if trusted.
        expect(deserializeScenePrecomp(null)).toBeNull();
        expect(deserializeScenePrecomp("nonsense")).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, format: 999 })).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, frameCount: "3" })).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, frameCount: -1 })).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, lifespans: [["", { startFrame: 0 }]] })).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, audioRequests: [{ id: "x" }] })).toBeNull();
        expect(deserializeScenePrecomp({ ...valid, assetRecords: [["k", { type: "image", src: "a" }]] })).toBeNull();
        // A loader record is never written, so seeing one means the entry is foreign.
        expect(deserializeScenePrecomp({
            ...valid,
            assetRecords: [["k", { type: "loader", src: "k", startFrame: 0, endFrame: 1 }]],
        })).toBeNull();
    });
});

describe("Precomp – host cache", () => {
    it("serves a stored pass instead of driving the generator", async () => {
        const { cache, gets } = memoryCache();

        const first = keyed("a.tsx", { yieldCount: 4 });
        await precompOf([first], cache).runAsync();
        expect(first.buildCount).toBe(1);

        // A fresh runner over a fresh scene instance, same key: nothing is measured.
        const second = keyed("a.tsx", { yieldCount: 4 });
        const result = await precompOf([second], cache).runAsync();

        expect(second.buildCount).toBe(0);
        expect(result.totalFrames).toBe(4);
        expect(result.complete).toBe(true);
        expect(gets).toContain("a.tsx");
    });

    it("stores only scenes that built cleanly", async () => {
        const { cache, puts } = memoryCache();
        const ok = keyed("ok.tsx", { yieldCount: 2 });
        const bad = keyed("bad.tsx", {
            yieldCount: 5,
            onPrepare: (_t, f) => { if (f === 1) throw new Error("boom"); },
        });

        const result = await precompOf([ok, bad], cache).runAsync();

        expect(result.buildErrors).toHaveLength(1);
        // Caching the throwing scene would replay it next run as a successful short
        // scene, and the error would silently disappear from the errors panel.
        expect(puts).toEqual(["ok.tsx"]);
    });

    it("never caches a scene with no stable identity", async () => {
        const { cache, gets, puts } = memoryCache();
        const anonymous = new FakeScene({ id: "inline", yieldCount: 3 });

        await precompOf([anonymous], cache).runAsync();

        expect(gets).toEqual([]);
        expect(puts).toEqual([]);
    });

    it("serves a content-keyed hot replace from the store instead of re-measuring", async () => {
        // The case an editor lives in: undo/redo, retyping a value back, dragging
        // a slider through a value it already visited. `__precompKey` names the
        // scene's *content*, so an equal key cannot be stale — and re-measuring
        // means driving the whole generator again, synchronously, per keystroke.
        const { cache, entries } = memoryCache();
        const v1 = contentKeyed("content:v1", { yieldCount: 4 });
        const before = await precompOf([v1], cache).runAsync();
        expect(entries.get("content:v1")?.frameCount).toBe(4);

        const runner = precompOf([v1], cache);
        const backToV1 = contentKeyed("content:v1", { yieldCount: 4 });
        const after = runner.replaceScene(before, 0, asScene(backToV1));

        expect(backToV1.buildCount).toBe(0);
        expect(after.totalFrames).toBe(4);
    });

    it("still measures a content-keyed replace whose content actually changed", async () => {
        // The other half: a changed scene *is* a changed key, so there is nothing
        // to serve and the pass has to be driven — and stored under the new key.
        const { cache, entries } = memoryCache();
        const v1 = contentKeyed("content:v1", { yieldCount: 4 });
        const before = await precompOf([v1], cache).runAsync();

        const runner = precompOf([v1], cache);
        const v2 = contentKeyed("content:v2", { yieldCount: 9 });
        const after = runner.replaceScene(before, 0, asScene(v2));

        expect(v2.buildCount).toBe(1);
        expect(after.totalFrames).toBe(9);
        expect(entries.get("content:v2")?.frameCount).toBe(9);
        // The previous content stays cached, which is what makes undo free.
        expect(entries.get("content:v1")?.frameCount).toBe(4);
    });

    it("hot reload bypasses the store for the edited scene and re-stores the result", async () => {
        const { cache, entries } = memoryCache();
        const original = keyed("a.tsx", { yieldCount: 4 });
        const before = await precompOf([original], cache).runAsync();
        expect(entries.get("a.tsx")?.frameCount).toBe(4);

        // The edited scene keeps its hot id — the store entry is stale by definition,
        // so a hit here would silently keep the old duration forever.
        const runner = precompOf([original], cache);
        const edited = keyed("a.tsx", { yieldCount: 9 });
        const after = runner.replaceScene(before, 0, asScene(edited));

        expect(edited.buildCount).toBe(1);
        expect(after.totalFrames).toBe(9);
        expect(entries.get("a.tsx")?.frameCount).toBe(9);
    });
});
