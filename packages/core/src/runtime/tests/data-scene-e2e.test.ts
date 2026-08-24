import { describe, it, expect } from "vitest";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { Precomp } from "@/runtime/precompisition";
import { DefaultTextStyle } from "@/nodes/text/default-text-style-node";
import { Column } from "@/nodes/layout/column-node";
import { Node2D, Node2DProps, NodeConfig } from "@/nodes/2d/node2d";
import { Text } from "@/nodes/text/text-node";
import { createRef } from "@/util/reference";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "@/runtime/runtime.fixtures";
import { createScene } from "@/nodes/scene/scene-node";

/**
 * Mirrors the `data-scene` template showcase under the composition model: a
 * custom composite node builds a `Text` child per record from a `stats` **prop**
 * (structure comes from props, so it's built in the constructor), nested under a
 * `DefaultTextStyle` (shared font) that flows *values* in through context. This
 * asserts both channels — structure-from-props children and inherited style —
 * hold through the real precomp/evaluator pipeline, including a re-seek (which
 * rebuilds a fresh instance, so children never accumulate).
 */

const VIEWPORT = { width: 400, height: 200 };
const FPS = 10;
const scope = new FakeMeasurer();
const catalog = () => asCatalog(new FakeAssetCatalog());

function evaluator(scene: ReturnType<typeof createScene>) {
    const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), scope).run();
    const tracks = precomp.scenes.map((s) => s.frameCount);
    return new StateEvaluator([scene], VIEWPORT, FPS, catalog(), tracks, scope);
}

interface Stat {
    label: string;
    value: string;
}

interface StatBoardProps extends Node2DProps {
    stats: Stat[];
}

/** Builds one Text child per stat taken from the `stats` prop — the scene's StatBoard. */
class StatBoard extends Node2D<StatBoardProps> {
    constructor(props: NodeConfig<StatBoard, StatBoardProps>) {
        super(props);
        const raw = props.stats;
        const stats = typeof raw === "function" ? raw() : raw ?? [];
        this.add(
            new Column({
                children: stats.map((s) => new Text({ text: `${s.label}: ${s.value}` })),
            }),
        );
    }
}

describe("data-scene — context-driven children + inherited style over the pipeline", () => {
    it("StatBoard builds its children from provided context and its Texts inherit the default font", () => {
        const stats: Stat[] = [
            { label: "Nodes", value: "1,204" },
            { label: "Frames", value: "3,600" },
            { label: "Scenes", value: "22" },
        ];
        const boardRef = createRef<StatBoard>();

        const scene = createScene(function* (stage) {
            stage.add(
                new DefaultTextStyle({
                    fontSize: 44,
                    fontFamily: "Pixelify Sans",
                    children: [new StatBoard({ ref: boardRef, stats })],
                }),
            );
            yield;
        });

        const ev = evaluator(scene);
        ev.stateAt(0);

        // Structure came from the prop: one Text per stat was built.
        const column = boardRef().children[0];
        const texts = column.children as Text[];
        expect(texts).toHaveLength(3);
        expect(texts.map((t) => t.text)).toEqual([
            "Nodes: 1,204",
            "Frames: 3,600",
            "Scenes: 22",
        ]);

        // Inherited style reached those Texts, though none set a font of their own.
        for (const t of texts) {
            expect(t.fontSize).toBe(44);
            expect(t.fontFamily).toBe("Pixelify Sans");
        }
    });

    it("re-seeking (a fresh pass) rebuilds the same children without accumulating", () => {
        const boardRef = createRef<StatBoard>();
        const scene = createScene(function* (stage) {
            stage.add(
                new StatBoard({ ref: boardRef, stats: [{ label: "A", value: "1" }, { label: "B", value: "2" }] }),
            );
            yield;
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect((boardRef().children[0].children as Text[])).toHaveLength(2);

        // A second pass rebuilds a fresh StatBoard instance (the generator runs
        // `new StatBoard(...)` again), so the count stays stable with no
        // clearChildren — nothing from the prior instance carries over.
        ev.stateAt(0);
        expect((boardRef().children[0].children as Text[])).toHaveLength(2);
    });
});
