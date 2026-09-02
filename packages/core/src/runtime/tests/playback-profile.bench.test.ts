import { describe, expect, it } from "vitest";

import { Rect } from "@/nodes/geometry/rect-node";
import { chainScene } from "@/runtime/scene.fixtures";
import { createRef } from "@/util/reference";
import type { Random } from "@/util/random";
import { easeInOut } from "@/tween/ease/constants";
import { profilePlayback } from "@/runtime/playback-profile.fixtures";

/**
 * Where a *playback* frame goes — the thing the editor and an export actually do
 * sixty times a second.
 *
 * The sibling `precomp-profile.bench.test.ts` measures the measuring pass, and
 * they are not interchangeable. Precomp's render phase is the
 * `TrackRenderContext` walk, which exists to discover assets and therefore can
 * never skip anything; playback's is a real paint. A change aimed at one, judged
 * on the other, will look like it did nothing — which is exactly what happened
 * to the first round of this work.
 *
 * The counts here are **deterministic**, and that is the point. The wall clock on
 * a developer machine moves ±25% between runs, which is wider than most changes
 * worth making; a count of nodes visited or `Graphics2D` submitted is the same on
 * every run, so a difference is a behaviour change and nothing else.
 *
 * Not assertions of performance — machines differ and CI would flake. Opt in:
 *
 *   MS_BENCH=1 pnpm --filter @motion-script/core test -- run src/runtime/playback-profile.bench.test.ts
 */

const HOLD_FRAMES = 120;
/** Matches `profilePlayback`'s own rate, so a hold in frames converts exactly. */
const FPS = 60;

/** A scene that builds a tree and then holds it, unchanged, for the duration. */
function staticScene(count: number) {
    return chainScene((stage) => {
        const random = stage.random("static");
        for (let i = 0; i < count; i++) {
            stage.add(new Rect({
                width: 24, height: 24, cornerRadius: 4,
                x: random.nextFloat(-900, 900), y: random.nextFloat(-500, 500),
            }));
        }
    }, [HOLD_FRAMES / FPS]);
}

/** The same tree, with every node under a tween. */
function animatingScene(count: number) {
    const refs = Array.from({ length: count }, () => createRef<Rect>());
    let random!: Random;
    const pose = () => ({
        x: random.nextFloat(-900, 900),
        y: random.nextFloat(-500, 500),
        rotation: random.nextFloat(0, 360),
    });
    return chainScene((stage) => {
        random = stage.random("moving");
        for (const ref of refs) {
            stage.add(new Rect({ ref, width: 24, height: 24, cornerRadius: 4, ...pose() }));
        }
    }, Array.from({ length: 4 }, () =>
        // One leg: every node tweens at once, so the group ends when the longest
        // does. What `yield* parallel(...)` meant, and what two document commands
        // sharing an `at` express.
        refs.map(ref => () => ref().to(pose(), 0.5, easeInOut("quad")))));
}

/**
 * Half the tree invisible — the shape a chart actually has.
 *
 * A `lineChart` carries a complete second vertical axis at `opacity: 0` purely to
 * reserve a gutter, and every cross-fade passes through this state. It is the
 * fixture the invisible-subtree skip was built for, and the precomp bench cannot
 * show it at all: the tracking walk descends into invisible nodes on purpose.
 */
function halfHiddenScene(count: number) {
    return chainScene((stage) => {
        const random = stage.random("hidden");
        for (let i = 0; i < count; i++) {
            const holder = new Rect({
                width: 40, height: 40,
                x: random.nextFloat(-900, 900), y: random.nextFloat(-500, 500),
                opacity: i % 2 === 0 ? 1 : 0,
            });
            // Children, so a skipped parent takes real work with it.
            holder.add(new Rect({ width: 12, height: 12 }));
            holder.add(new Rect({ width: 8, height: 8 }));
            stage.add(holder);
        }
    }, [HOLD_FRAMES / FPS]);
}

function report(label: string, profile: ReturnType<typeof profilePlayback>) {
    const { counts: c, timings: t } = profile;
    const per = (n: number) => (n / c.frames).toFixed(1).padStart(8);
    console.log(
        `\n${label} — ${c.frames} playback frames`
        + `\n  per frame:  nodes ${per(c.nodesVisited)}   graphics ${per(c.graphicsDrawn)}`
        + `   ops ${per(c.opsDrawn)}   clips ${per(c.clips)}   text ${per(c.textMeasures)}`
        + `\n  ms/frame:   state ${(t.stateMs / c.frames).toFixed(2)}`
        + `   layout ${(t.layoutMs / c.frames).toFixed(2)}`
        + `   render ${(t.renderMs / c.frames).toFixed(2)}`
        + `   total ${(t.totalMs / c.frames).toFixed(2)}\n`,
    );
}

describe.runIf(process.env.MS_BENCH)("playback cost breakdown", () => {
    it("reports a scene that only holds still", () => {
        const profile = profilePlayback(staticScene(1200), HOLD_FRAMES);
        report("1200 static rects", profile);
        expect(profile.counts.frames).toBeGreaterThan(0);
    });

    it("reports a scene where everything moves", () => {
        const profile = profilePlayback(animatingScene(1200), HOLD_FRAMES);
        report("1200 animating rects", profile);
        expect(profile.counts.frames).toBeGreaterThan(0);
    });

    it("reports a scene that is half invisible", () => {
        const profile = profilePlayback(halfHiddenScene(600), HOLD_FRAMES);
        report("600 holders, half at opacity 0 (1800 nodes)", profile);
        expect(profile.counts.frames).toBeGreaterThan(0);
    });
});

/**
 * The counts, as assertions rather than a printout.
 *
 * These run in CI, unlike the report above, because they are exact and
 * machine-independent — and because they are the regression guard for the
 * invisible-subtree skip. A change that quietly stops skipping invisible
 * subtrees shows up here as a number, not as a stopwatch reading nobody trusts.
 */
describe("playback counts", () => {
    it("visits every node of a fully visible tree, every frame", () => {
        const profile = profilePlayback(staticScene(10), 5);
        const perFrame = profile.counts.nodesVisited / profile.counts.frames;
        // 10 rects + the scene root. The renderer is immediate-mode: a static
        // scene is redrawn in full every frame, and *must* be — this is the
        // baseline the skips below are measured against.
        expect(perFrame).toBe(11);
    });

    it("does not descend into subtrees at zero opacity", () => {
        // 50 visible holders × (1 holder + 2 children) + the root = 151. The 50
        // hidden holders contribute *nothing*, not even themselves: the skip
        // returns before `begin()`, so they are never entered — which is the whole
        // point, since entering one would mean walking its children too.
        //
        // Small on purpose: `profilePlayback` runs a full precomp first, and these
        // assertions run in CI. The opt-in report above uses the large fixtures.
        const profile = profilePlayback(halfHiddenScene(100), 5);
        const perFrame = profile.counts.nodesVisited / profile.counts.frames;
        expect(perFrame).toBe(151);
    });

    it("builds a fresh drawing for every visible node, every frame", () => {
        // The immediate-mode contract, stated as a count. Nothing between
        // `shapeGraphics` and the renderer caches: a node contributes one fresh
        // `Graphics2D` per frame whether it moved or not. Asserted in both
        // directions below so that reintroducing a cache — deliberately or by
        // accident — shows up here as a number rather than as a stale frame.
        const still = profilePlayback(staticScene(10), 5);
        expect(still.counts.graphicsDrawn).toBe(10 * still.counts.frames);
        expect(still.counts.graphicsBuilt).toBe(10 * still.counts.frames);

        const moving = profilePlayback(animatingScene(10), 5);
        expect(moving.counts.graphicsBuilt).toBe(10 * moving.counts.frames);
    });

    it("draws nothing for an invisible subtree", () => {
        const half = profilePlayback(halfHiddenScene(100), 5);
        const all = profilePlayback(staticScene(300), 5);
        // Half the holders contribute no graphics at all, so a half-hidden tree
        // of 300 nodes draws far less than a fully visible one of the same size.
        expect(half.counts.graphicsDrawn).toBeLessThan(all.counts.graphicsDrawn);
    });
});
