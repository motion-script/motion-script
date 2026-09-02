import { describe, it, expect } from "vitest";

import { Precomp, type PrecompResult } from "@/runtime/precompisition";
import {
    FakeScene,
    FakeMeasurer,
    FakeAssetCatalog,
    asScenes,
    asCatalog,
    setFakeSceneFps,
} from "@/runtime/runtime.fixtures";

/**
 * What a background pass does when the host moves the scene list under it.
 *
 * `runAsync` is an index-based scan over `Precomp`'s own arrays, and `setScenes`
 * / `replaceScene` rewrite exactly those arrays. Nothing coordinated the two, so
 * a pass that was part-way through a scene resumed and committed its measurement
 * at an index the host had since given to a **different scene** — a scene
 * wearing someone else's frame count and, worse, someone else's asset windows.
 * The second of those is the `AssetNotLoadedError` an image fill throws at draw
 * time, reported as "a scene failed to build" long after the build succeeded.
 *
 * These pin the two halves of the answer: a stale commit can never land, and the
 * pass carries on to measure whatever the new list added rather than abandoning
 * it as a zero-length hole for the rest of the session.
 *
 * The list is moved from inside the scene's own per-frame hook rather than from
 * a timer. A timer would be racing the scheduler for which macrotask runs first,
 * and the interleaving this is about — the walk holding an index into arrays
 * that have been replaced — is reproduced exactly by mutating mid-walk, without
 * any of that flakiness.
 */

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;
setFakeSceneFps(FPS);
const scope = new FakeMeasurer();

/** A precomp over `scenes`, with every fake told the rate it is measured at. */
function precompOver(scenes: FakeScene[]): Precomp {
    for (const scene of scenes) scene.fps = FPS;
    return new Precomp(
        asScenes(scenes),
        VIEWPORT,
        FPS,
        asCatalog(new FakeAssetCatalog()),
        scope,
    );
}

/** A scene of `frames` frames that runs `at(frame)` once, on frame `on`. */
function interrupting(
    id: string,
    frames: number,
    on: number,
    at: () => void,
): FakeScene {
    let fired = false;
    return new FakeScene({
        id,
        yieldCount: frames,
        onPrepare: (_tracker, frame) => {
            if (fired || frame < on) return;
            fired = true;
            at();
        },
    });
}

/** The result as it stands, without measuring anything further. */
const current = (precomp: Precomp): PrecompResult =>
    (precomp as unknown as { assemble(): PrecompResult }).assemble();

describe("Precomp.runAsync against a moving scene list", () => {
    it("never commits a measurement into a slot the host has reassigned", async () => {
        const a = new FakeScene({ id: "a", yieldCount: 3 });
        const d = new FakeScene({ id: "d", yieldCount: 7 });
        d.fps = FPS;

        let precomp!: Precomp;
        // `b` drops itself and `c` from the list half-way through its own walk.
        const b = interrupting("b", 40, 20, () => {
            precomp.setScenes(current(precomp), asScenes([a, d]));
        });
        const c = new FakeScene({ id: "c", yieldCount: 40 });
        precomp = precompOver([a, b, c]);

        const final = await precomp.runAsync({ budgetMs: 0 });

        expect(final.scenes).toHaveLength(2);
        // `b`'s 40 frames must not appear anywhere: the slot it was measured for
        // belongs to `d` now, and `d` is 7 frames long.
        expect(final.scenes.map((s) => s.frameCount)).toEqual([3, 7]);
        expect(final.complete).toBe(true);
    });

    it("measures a scene the host added mid-pass rather than leaving it pending", async () => {
        const a = new FakeScene({ id: "a", yieldCount: 3 });
        const c = new FakeScene({ id: "c", yieldCount: 5 });
        c.fps = FPS;

        let precomp!: Precomp;
        let reconciled: PrecompResult | null = null;
        const b = interrupting("b", 40, 20, () => {
            reconciled = precomp.setScenes(current(precomp), asScenes([a, b, c]));
        });
        precomp = precompOver([a, b]);

        const final = await precomp.runAsync({ budgetMs: 0 });

        // The newcomer is a zero-length placeholder the instant it arrives, which
        // is the shape a progressively-measured project already has…
        expect(reconciled!.scenes[2].measured).toBe(false);
        // …and the pass that was already running is what fills it in. Nothing
        // else would: the controller starts one pass, in its constructor.
        expect(final.complete).toBe(true);
        expect(final.scenes.map((s) => s.frameCount)).toEqual([3, 40, 5]);
    });

    it("keeps a synchronous re-measure from being overwritten by the interrupted pass", async () => {
        const a = new FakeScene({ id: "a", yieldCount: 3 });
        const edited = new FakeScene({ id: "b", yieldCount: 9 });
        edited.fps = FPS;

        let precomp!: Precomp;
        let replaced: PrecompResult | null = null;
        // The editing case: the very scene being measured in the background is
        // hot-replaced. `replaceScene` measures the new content synchronously,
        // and the walk still holding the *old* content must not land on top of it.
        const b = interrupting("b", 40, 20, () => {
            replaced = precomp.replaceScene(current(precomp), 1, edited);
        });
        precomp = precompOver([a, b]);

        const final = await precomp.runAsync({ budgetMs: 0 });

        expect(replaced!.scenes[1].frameCount).toBe(9);
        expect(final.scenes.map((s) => s.frameCount)).toEqual([3, 9]);
    });
});
