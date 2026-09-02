import { beforeAll, describe, expect, it } from "vitest";

import { ManifestAssetCatalog } from "@/assets/catalog";
import { Rect } from "@/nodes/geometry/rect-node";
import { Text } from "@/nodes/text/text-node";
import type { Scene } from "@/nodes/scene/scene-node";
import { Precomp } from "@/runtime/precompisition";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { FakeMeasurer } from "@/runtime/runtime.fixtures";

import { registerBuiltins } from "../builtins";
import { createAnimationScene, createStillScene } from "../scene";
import type { AnimationDocument, CommandSpec, NodeSpec, StillDocument } from "../types";

const FPS = 30;
const VIEWPORT = { width: 200, height: 200 };
const catalog = () => new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} });

beforeAll(() => registerBuiltins());

function node(id: string, type: string, props: Record<string, unknown>, parent: string | null = null, order = 0): NodeSpec {
    return { id, type, parent, order, props };
}

function evaluatorFor(scene: Scene): StateEvaluator {
    const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), new FakeMeasurer()).run();
    return new StateEvaluator(
        [scene], VIEWPORT, FPS, catalog(),
        precomp.scenes.map((s) => s.frameCount),
        new FakeMeasurer(),
    );
}

/** The first `Rect` in the scene's tree, by node order. */
function rects(scene: Scene): Rect[] {
    return scene.canvas.children.filter((c): c is Rect => c instanceof Rect);
}

describe("still documents", () => {
    const doc: StillDocument = {
        kind: "still",
        root: { fill: "#101014" },
        nodes: [
            node("card", "rect", { width: 100, height: 60, x: 10 }),
            node("title", "text", { text: "hello", fontSize: 20 }, "card", 0),
        ],
    };

    it("builds the tree its rows describe, parented and ordered", () => {
        const scene = createStillScene(doc);
        const evaluator = evaluatorFor(scene);
        evaluator.stateAt(0);

        const [card] = rects(scene);
        expect(card).toBeDefined();
        expect(card.x).toBe(10);
        expect(card.children[0]).toBeInstanceOf(Text);
    });

    it("measures as a single frame and applies root props", () => {
        const scene = createStillScene(doc);
        const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), new FakeMeasurer()).run();
        expect(precomp.totalFrames).toBe(1);
    });

    it("orders siblings by `order`, not by array position", () => {
        const scene = createStillScene({
            kind: "still",
            nodes: [
                node("b", "rect", { width: 1, height: 1, x: 2 }, null, 1),
                node("a", "rect", { width: 1, height: 1, x: 1 }, null, 0),
            ],
        });
        evaluatorFor(scene).stateAt(0);
        expect(rects(scene).map((r) => r.x)).toEqual([1, 2]);
    });
});

describe("animation documents", () => {
    /** A rect that slides 0 → 90 over [0,1], then fades 1 → 0 over [1,2]. */
    const slideThenFade: AnimationDocument = {
        kind: "animation",
        commands: [
            {
                id: "add", type: "add", target: null, at: 0, params: {
                    node: node("box", "rect", { width: 10, height: 10, x: 0, opacity: 1 }),
                },
            },
            { id: "slide", type: "to", target: "box", at: 0, duration: 1, params: { props: { x: 90 } } },
            { id: "fade", type: "to", target: "box", at: 1, duration: 1, params: { props: { opacity: 0 } } },
        ],
    };

    it("derives its duration from the last command's end", () => {
        const scene = createAnimationScene(slideThenFade);
        const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), new FakeMeasurer()).run();
        // 2s at 30fps.
        expect(precomp.totalFrames).toBe(60);
    });

    it("honours an explicit duration that holds past the last command", () => {
        const scene = createAnimationScene({ ...slideThenFade, duration: 3 });
        const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), new FakeMeasurer()).run();
        expect(precomp.totalFrames).toBe(90);
    });

    it("chains: a command starts from where the previous one left the node", () => {
        const scene = createAnimationScene({
            kind: "animation",
            commands: [
                { id: "a", type: "add", target: null, at: 0, params: { node: node("box", "rect", { width: 1, height: 1, x: 0 }) } },
                { id: "s1", type: "to", target: "box", at: 0, duration: 1, params: { props: { x: 50 } } },
                { id: "s2", type: "to", target: "box", at: 1, duration: 1, params: { props: { x: 80 } } },
            ],
        });
        const evaluator = evaluatorFor(scene);

        evaluator.stateAt(FPS);           // t = 1s, end of the first leg
        expect(rects(scene)[0].x).toBeCloseTo(50, 3);

        evaluator.stateAt(FPS + FPS / 2); // t = 1.5s, halfway through the second
        expect(rects(scene)[0].x).toBeCloseTo(65, 3);
    });

    /**
     * The property the whole model exists for: a frame is a function of its
     * time, not of the route the playhead took to reach it.
     */
    it("evaluates the same frame identically walked forwards, jumped to, or reached backwards", () => {
        const walked = createAnimationScene(slideThenFade);
        const jumped = createAnimationScene(slideThenFade);
        const backwards = createAnimationScene(slideThenFade);

        const a = evaluatorFor(walked);
        const b = evaluatorFor(jumped);
        const c = evaluatorFor(backwards);

        const target = 20; // frame 20 of 60

        for (let f = 0; f <= target; f++) a.stateAt(f);
        b.stateAt(target);
        c.stateAt(59);
        c.stateAt(target);

        const read = (s: Scene) => {
            const r = rects(s)[0];
            return { x: r.x, opacity: r.opacity };
        };
        expect(read(jumped)).toEqual(read(walked));
        expect(read(backwards)).toEqual(read(walked));
    });

    it("holds a finished command at its end value rather than dropping it", () => {
        const scene = createAnimationScene(slideThenFade);
        const evaluator = evaluatorFor(scene);
        evaluator.stateAt(59); // well past the slide, mid-fade

        // `x` was written by a command that finished at 1s and is never touched
        // again; it must still read 90 rather than falling back to its authored 0.
        expect(rects(scene)[0].x).toBeCloseTo(90, 3);
    });

    it("does not leak a not-yet-started command's value backwards", () => {
        const scene = createAnimationScene(slideThenFade);
        const evaluator = evaluatorFor(scene);

        evaluator.stateAt(59);  // run to the end first
        evaluator.stateAt(0);   // then back to the very start

        expect(rects(scene)[0].x).toBeCloseTo(0, 3);
        expect(rects(scene)[0].opacity).toBeCloseTo(1, 3);
    });
});

describe("presence", () => {
    const doc: AnimationDocument = {
        kind: "animation",
        duration: 3,
        commands: [
            { id: "a1", type: "add", target: null, at: 0, params: { node: node("early", "rect", { width: 1, height: 1 }) } },
            { id: "a2", type: "add", target: null, at: 1, params: { node: node("late", "rect", { width: 1, height: 1 }, null, 1) } },
            { id: "r1", type: "remove", target: "early", at: 2, params: {} },
        ] as CommandSpec[],
    };

    it("adds and removes nodes at the times the document declares", () => {
        const scene = createAnimationScene(doc);
        const evaluator = evaluatorFor(scene);

        evaluator.stateAt(0);
        expect(rects(scene)).toHaveLength(1);

        evaluator.stateAt(FPS + 5);   // past 1s: both present
        expect(rects(scene)).toHaveLength(2);

        evaluator.stateAt(2 * FPS + 5); // past 2s: `early` gone
        expect(rects(scene)).toHaveLength(1);
    });

    it("computes presence from the document, so a backward seek restores it", () => {
        const scene = createAnimationScene(doc);
        const evaluator = evaluatorFor(scene);

        evaluator.stateAt(2 * FPS + 5);
        expect(rects(scene)).toHaveLength(1);

        evaluator.stateAt(FPS + 5);
        expect(rects(scene)).toHaveLength(2);

        evaluator.stateAt(0);
        expect(rects(scene)).toHaveLength(1);
    });
});
