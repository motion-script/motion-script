import { describe, it, expect } from "vitest";
import { Precomp, PrecompResult } from "@/runtime/precompisition";
import { Rect } from "@/nodes/geometry/rect-node";
import { Text } from "@/nodes/text/text-node";
import { createRef } from "@/util/reference";
import { createScene, Scene } from "@/nodes/scene/scene-node";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "@/runtime/runtime.fixtures";

/**
 * The incremental precomp driven against **real** scenes rather than the
 * `FakeScene` stand-in.
 *
 * `precomp-incremental.test.ts` proves the scheduling logic; this proves it
 * against the real per-frame loop — real flexbox layout, real text measurement,
 * real node add/remove, real `Graphics2D` construction through
 * `TrackRenderContext`. Those are the parts that could plausibly break when the
 * loop was reshaped into a suspendable generator, and a fake scene exercises
 * none of them.
 */

const VIEWPORT = { width: 800, height: 400 };
const FPS = 10;
const scope = new FakeMeasurer();
const catalog = () => asCatalog(new FakeAssetCatalog());

/** Layout-heavy: a hug row whose middle child is removed mid-scene. */
function removingRow(label: string) {
    return createScene(function* (stage) {
        const row = createRef<Rect>();
        stage.add(
            new Rect({
                ref: row, width: "hug", height: "fill", flow: "horizontal", gap: 24, align: "centerLeft",
                children: [
                    new Rect({ width: 120, height: 120, children: [new Text({ text: label })] }),
                    new Rect({ width: 120, height: 120 }),
                    new Rect({ width: 120, height: 120 }),
                ],
            }),
        );
        for (let i = 0; i < 4; i++) yield;
        yield* row().removeChildAt(1, 0.6);
        for (let i = 0; i < 3; i++) yield;
    });
}

/** Tween-heavy: a box that animates through several legs of differing length. */
function movingBox(distance: number) {
    return createScene(function* (stage) {
        const box = createRef<Rect>();
        stage.add(new Rect({ ref: box, width: 80, height: 80, x: 0, y: 0 }));
        yield* box().to({ x: distance }, 0.5);
        yield* box().to({ y: distance, rotation: 45 }, 0.7);
        yield* box().to({ x: 0, y: 0, rotation: 0 }, 0.4);
    });
}

const buildScenes = (): Scene[] => [removingRow("A"), movingBox(200), removingRow("B")];

const precompOf = (scenes: Scene[]) => new Precomp(scenes, VIEWPORT, FPS, catalog(), scope);

/** Strip the fields that legitimately differ between runs (none today, but explicit). */
const shape = (r: PrecompResult) => ({
    totalFrames: r.totalFrames,
    totalDuration: r.totalDuration,
    complete: r.complete,
    scenes: r.scenes.map(s => ({
        measured: s.measured,
        frameCount: s.frameCount,
        startFrame: s.startFrame,
        audioRequests: s.audioRequests,
        assetRecords: [...s.assetRecords.entries()],
        lifespans: [...s.lifespans.entries()],
    })),
    assets: [...r.assets.entries()],
    buildErrors: r.buildErrors,
});

describe("Precomp – incremental measurement against real scenes", () => {
    it("yielding every frame produces byte-identical output to the synchronous pass", async () => {
        const sync = precompOf(buildScenes()).run();
        const streamed = await precompOf(buildScenes()).runAsync({ budgetMs: 0 });

        // Includes per-node lifespans keyed by structural path, so this also
        // asserts the scene tree evolved identically across suspensions.
        expect(shape(streamed)).toEqual(shape(sync));
        expect(sync.totalFrames).toBeGreaterThan(0);
        expect(sync.scenes.every(s => s.frameCount > 0)).toBe(true);
    });

    it("measuring one scene on demand matches measuring it as part of a full pass", () => {
        const full = precompOf(buildScenes()).run();

        // A screenshot deep in the project only needs scenes 0..k, and takes the
        // demand path to get them. Those passes must be identical to the full run's.
        const partial = precompOf(buildScenes()).runUntil(i => i === 1);

        expect(partial.complete).toBe(false);
        expect(partial.scenes.map(s => s.measured)).toEqual([true, true, false]);
        expect(partial.scenes[0].frameCount).toBe(full.scenes[0].frameCount);
        expect(partial.scenes[1].frameCount).toBe(full.scenes[1].frameCount);
        expect(partial.scenes[1].startFrame).toBe(full.scenes[1].startFrame);
        expect([...partial.scenes[1].lifespans.entries()])
            .toEqual([...full.scenes[1].lifespans.entries()]);
    });

    it("a scene that throws is still recorded, and the pass carries on", async () => {
        const scenes: Scene[] = [
            movingBox(100),
            createScene(function* () { yield; throw new Error("boom"); }),
            movingBox(150),
        ];
        const result = await precompOf(scenes).runAsync({ budgetMs: 0 });

        expect(result.complete).toBe(true);
        expect(result.buildErrors).toHaveLength(1);
        expect(result.buildErrors[0]).toMatchObject({ sceneIndex: 1, message: "boom" });
        // The throwing scene is still `measured` — it has a known (short) duration —
        // and the scenes after it were measured normally.
        expect(result.scenes.map(s => s.measured)).toEqual([true, true, true]);
        expect(result.scenes[2].frameCount).toBeGreaterThan(0);
    });
});
