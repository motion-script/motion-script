import { describe, it, expect } from "vitest";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { Precomp } from "@/runtime/precompisition";
import { DefaultTextStyle } from "@/nodes/text/default-text-style-node";
import { ThemeProvider } from "@/nodes/scene/theme-provider-node";
import { Text } from "@/nodes/text/text-node";
import { Rect } from "@/nodes/geometry/rect-node";
import { createRef } from "@/util/reference";
import { ThemeToken } from "@/runtime/builtin-context";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "@/runtime/runtime.fixtures";
import { createScene } from "@/nodes/scene/scene-node";

/** @jsxImportSource @motion-script/core/jsx */

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;
const scope = new FakeMeasurer();
const catalog = () => asCatalog(new FakeAssetCatalog());

function evaluator(scene: ReturnType<typeof createScene>) {
    // Run a precomp first to derive frame counts, then build a StateEvaluator
    // over the same scene so we can seek and inspect the live tree.
    const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), scope).run();
    const tracks = precomp.scenes.map((s) => s.frameCount);
    return new StateEvaluator([scene], VIEWPORT, FPS, catalog(), tracks, scope);
}

describe("context — full precomp/evaluator pipeline", () => {
    it("a tween from an inherited default snapshots the inherited value, not the raw default", () => {
        const txt = createRef<Text>();
        const scene = createScene(function* (stage) {
            stage.add(
                new DefaultTextStyle({
                    fontSize: 32,
                    children: [new Text({ ref: txt, text: "hi" })],
                }),
            );
            // Animate fontSize away from its inherited starting value.
            yield* txt().to({ fontSize: 64 }, 0.5);
        });

        const ev = evaluator(scene);

        // Frame 0: the inherited default (32) must be the tween's `from`, NOT the
        // Text @property default (16). This is the reinit/re-run correctness gate.
        ev.stateAt(0);
        expect(txt().fontSize).toBe(32);

        // Mid-tween, the value is interpolating *from 32* (not 16) toward 64 —
        // i.e. strictly above the inherited start and below the target.
        ev.stateAt(2);
        expect(txt().fontSize).toBeGreaterThan(32);
        expect(txt().fontSize).toBeLessThan(64);

        // Last frame: the tween has settled at its target (0.5s @ 10fps → 5 frames).
        ev.stateAt(5);
        expect(txt().fontSize).toBeCloseTo(64, 5);

        // Seek back to 0 — a fresh pass re-applies the inherited default cleanly.
        ev.stateAt(0);
        expect(txt().fontSize).toBe(32);
    });

    it("a provider added by the generator reaches its descendants", () => {
        const leaf = createRef<Rect>();
        const scene = createScene(function* (stage) {
            stage.add(
                new ThemeProvider({
                    theme: { brand: "#abc" },
                    children: [new Rect({ ref: leaf, width: 10, height: 10 })],
                }),
            );
            yield;
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(leaf().useContext(ThemeToken)).toEqual({ brand: "#abc" });
    });
});
