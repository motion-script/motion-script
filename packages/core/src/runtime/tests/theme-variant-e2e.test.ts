import { describe, it, expect, afterEach } from "vitest";
import { chainScene } from "@/runtime/scene.fixtures";
import { StateEvaluator } from "@/runtime/state-evaluator";
import { Precomp } from "@/runtime/precompisition";
import { DefaultTextStyle } from "@/nodes/text/default-text-style-node";
import { Text } from "@/nodes/text/text-node";
import { createRef } from "@/util/reference";
import { setTheme } from "@/attributes/shape/fill/color/parser";
import { FakeMeasurer, FakeAssetCatalog, asCatalog } from "@/runtime/runtime.fixtures";
import type { Scene } from "@/nodes/scene/scene-node";

/** @jsxImportSource @motion-script/core/jsx */

const VIEWPORT = { width: 200, height: 100 };
const FPS = 10;
const scope = new FakeMeasurer();
const catalog = () => asCatalog(new FakeAssetCatalog());

function evaluator(scene: Scene) {
    const precomp = new Precomp([scene], VIEWPORT, FPS, catalog(), scope).run();
    const tracks = precomp.scenes.map((s) => s.frameCount);
    return new StateEvaluator([scene], VIEWPORT, FPS, catalog(), tracks, scope);
}

describe("Text variant — typography preset precedence", () => {
    afterEach(() => setTheme());

    it("a variant supplies a style prop the author didn't set", () => {
        setTheme({ typography: { header: { fontSize: 96, fontWeight: 700 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi", variant: "header" }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(96);
        expect(txt().fontWeight).toBe(700);
    });

    it("an explicit author prop wins over the variant", () => {
        setTheme({ typography: { header: { fontSize: 96, fontWeight: 700 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi", variant: "header", fontSize: 40 }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(40);  // explicit wins
        expect(txt().fontWeight).toBe(700); // variant still supplies the rest
    });

    it("a variant wins over an inherited <DefaultTextStyle>", () => {
        setTheme({ typography: { header: { fontSize: 96 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(
                new DefaultTextStyle({
                    fontSize: 32,
                    children: [new Text({ ref: txt, text: "hi", variant: "header" })],
                }),
            );
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(96); // variant beats the inherited 32
    });

    it("a key the variant doesn't set falls through to <DefaultTextStyle>", () => {
        setTheme({ typography: { header: { fontWeight: 700 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(
                new DefaultTextStyle({
                    fontSize: 48,
                    children: [new Text({ ref: txt, text: "hi", variant: "header" })],
                }),
            );
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontWeight).toBe(700); // from variant
        expect(txt().fontSize).toBe(48);    // falls through to DefaultTextStyle
    });

    it("an unknown variant is a no-op (node keeps its own defaults)", () => {
        setTheme({ typography: { header: { fontSize: 96 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi", variant: "nope" }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(16); // the Text @property default
    });

    it("a `default` typography preset applies with no variant or <DefaultTextStyle>", () => {
        setTheme({ typography: { default: { fontSize: 40, fontFamily: "Zilla Slab" } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi" }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(40);
        expect(txt().fontFamily).toBe("Zilla Slab");
    });

    it("an explicit variant wins over the `default` preset", () => {
        setTheme({
            typography: {
                default: { fontSize: 40 },
                header: { fontSize: 96 },
            },
        });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi", variant: "header" }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(96);
    });

    it("an inherited <DefaultTextStyle> wins over the `default` preset", () => {
        setTheme({ typography: { default: { fontSize: 40 } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(
                new DefaultTextStyle({
                    fontSize: 32,
                    children: [new Text({ ref: txt, text: "hi" })],
                }),
            );
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontSize).toBe(32);
    });

    it("a key the `default` preset doesn't set falls through to the node's own default", () => {
        setTheme({ typography: { default: { fontFamily: "Zilla Slab" } } });
        const txt = createRef<Text>();
        const scene = chainScene((stage) => {
            stage.add(new Text({ ref: txt, text: "hi" }));
        });

        const ev = evaluator(scene);
        ev.stateAt(0);
        expect(txt().fontFamily).toBe("Zilla Slab");
        expect(txt().fontSize).toBe(16); // the Text @property default
    });
});
