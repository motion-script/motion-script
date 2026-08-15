import { describe, it, expect } from "vitest";
import { Precomp, createPrecompProfile } from "@/runtime/precompisition";
import { Rect } from "@/nodes/geometry/rect-node";
import { createRef } from "@/util/reference";
import { createScene } from "@/nodes/scene/scene-node";
import { parallel } from "@/tween/parallel";
import { easeInOut } from "@/tween/ease/constants";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "./runtime.fixtures";

/**
 * Where the precomp pass actually spends its time, printed as a per-phase
 * breakdown.
 *
 * Not an assertion of performance — machines differ and CI would flake. It exists
 * so optimization work is ranked by measurement rather than by reading the code
 * and guessing, and so the effect of a change can be seen rather than assumed.
 *
 * Opt-in, because it is a measuring instrument rather than a test: it drives ten
 * full precomp passes, which takes seconds and produces a machine-dependent
 * number no CI run would read. Set `MS_BENCH` to run it:
 *
 *   MS_BENCH=1 pnpm --filter @motion-script/core test -- run src/runtime/precomp-profile.bench.test.ts
 *
 * The fixture mirrors `packages/template`'s `expensive` stress scene: a large
 * number of independently-tweened rects, which is the shape that makes the
 * per-frame walks dominate. It has no text, so the fake measure scope costs
 * roughly what a real one would — a text-heavy project would shift weight toward
 * `layout` and is worth profiling separately in the browser.
 */

const VIEWPORT = { width: 1920, height: 1080 };
const FPS = 60;

function heavyScene(count: number, legs: number, seed: string) {
    return createScene(function* (stage) {
        const random = stage.random(seed);
        const halfW = VIEWPORT.width / 2;
        const halfH = VIEWPORT.height / 2;
        const pose = () => ({
            x: random.nextFloat(-halfW, halfW),
            y: random.nextFloat(-halfH, halfH),
            rotation: random.nextFloat(0, 360),
            scale: random.nextFloat(0.4, 1.6),
        });

        const refs = Array.from({ length: count }, () => createRef<Rect>());
        for (const ref of refs) {
            const start = pose();
            stage.add(new Rect({
                ref, width: 24, height: 24, cornerRadius: 4,
                x: start.x, y: start.y, rotation: start.rotation, scale: start.scale,
            }));
        }

        for (let i = 0; i < legs; i++) {
            yield* parallel(...refs.map(ref => ref().to(pose(), 0.5, easeInOut('quad'))));
        }
    });
}

/**
 * Runs vary by 2x on a machine doing anything else, so a single pass cannot tell
 * an optimization from background noise. Report the **best** of several: the
 * fastest run is the one least polluted by other work, which makes successive
 * measurements comparable in a way an average never is.
 */
const RUNS = 5;

/**
 * A scene that builds its tree then simply holds it, unchanged, for the whole
 * duration — a title card, a diagram left on screen, the tail of almost any
 * shot. Nothing moves, so every frame recomputes an identical answer, and it is
 * the shape where per-frame work is most obviously avoidable.
 */
function staticScene(count: number, frames: number) {
    return createScene(function* (stage) {
        const random = stage.random("static");
        for (let i = 0; i < count; i++) {
            stage.add(new Rect({
                width: 24, height: 24, cornerRadius: 4,
                x: random.nextFloat(-900, 900), y: random.nextFloat(-500, 500),
            }));
        }
        for (let f = 0; f < frames; f++) yield;
    });
}

/** Run one scene through the profiler `RUNS` times and keep the fastest pass. */
function bestOf(scene: ReturnType<typeof createScene>) {
    let best: ReturnType<typeof createPrecompProfile>["timings"][number];
    for (let i = 0; i < RUNS; i++) {
        const profile = createPrecompProfile();
        // A fresh runner each time: `Precomp` memoizes per scene, so reusing one
        // would serve run 1's cached pass and measure nothing at all.
        new Precomp(
            [scene], VIEWPORT, FPS, asCatalog(new FakeAssetCatalog()), new FakeMeasurer(),
            { profile },
        ).run();
        const t = profile.timings[0];
        if (t && (!best || t.totalMs < best.totalMs)) best = t;
    }
    return best!;
}

function report(label: string, t: ReturnType<typeof bestOf>) {
    const rows = Object.entries(t.phases)
        .sort((a, b) => b[1] - a[1])
        .map(([phase, ms]) =>
            `  ${phase.padEnd(14)} ${ms.toFixed(0).padStart(6)} ms  ${(ms / t.totalMs * 100).toFixed(1).padStart(5)}%`);
    console.log(
        `\n${label} x ${t.frameCount} frames @ ${FPS}fps  (best of ${RUNS})` +
        `\n  ${'TOTAL'.padEnd(14)} ${t.totalMs.toFixed(0).padStart(6)} ms  ` +
        `(${(t.totalMs / t.frameCount).toFixed(2)} ms/frame)\n` +
        rows.join("\n") + "\n",
    );
}

describe.runIf(process.env.MS_BENCH)("precomp cost breakdown", () => {
    it("reports where a heavy animating scene's pass spends its time", () => {
        const t = bestOf(heavyScene(1200, 4, "bench"));
        report("1200 animating rects", t);
        expect(t.frameCount).toBeGreaterThan(0);
    });

    it("reports the cost of a scene that only holds still", () => {
        // Every frame here is identical to the last. Whatever this still costs is
        // work the engine is redoing for an answer it already had.
        const t = bestOf(staticScene(1200, 124));
        report("1200 static rects", t);
        expect(t.frameCount).toBeGreaterThan(0);
    });
});
