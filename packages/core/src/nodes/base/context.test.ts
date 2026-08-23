import { describe, it, expect } from "vitest";
import { createContext, ContextMap } from "@/util/context";
import { Node2D } from "./node2d";
import { Rect } from "../geometry/rect-node";
import { Text } from "../text/text-node";
import { Provider } from "../scene/provider-node";
import { ThemeProvider } from "../scene/theme-provider-node";
import { DefaultTextStyle } from "../text/default-text-style-node";
import { ThemeToken, DataToken, SeedToken } from "@/runtime/builtin-context";
import { Random } from "@/util/random";

/** Assemble a tree and run the start-of-pass bind walk, the way precomp does. */
function bind(root: Node2D): void {
    root.bindContext(ContextMap.EMPTY, true);
}

describe("createContext / ContextMap", () => {
    it("returns the default when a token is unset", () => {
        const Money = createContext<number>(7);
        expect(ContextMap.EMPTY.get(Money)).toBe(7);
    });

    it("with() is immutable and nearest-wins per token", () => {
        const Money = createContext<number>(0);
        const a = ContextMap.EMPTY.with(Money, 1);
        const b = a.with(Money, 2);
        expect(a.get(Money)).toBe(1); // unchanged by the later layer
        expect(b.get(Money)).toBe(2);
    });

    it("keeps distinct tokens independent", () => {
        const A = createContext<number>(0);
        const B = createContext<string>("x");
        const m = ContextMap.EMPTY.with(A, 5);
        expect(m.get(A)).toBe(5);
        expect(m.get(B)).toBe("x"); // B falls back to its own default
    });
});

describe("Provider / useContext over the tree", () => {
    const Money = createContext<number>(0, "money");

    it("a descendant reads the nearest provider's value", () => {
        const leaf = new Rect({ width: 1, height: 1 });
        const root = new Provider({ context: Money, value: 500, children: [leaf] });
        bind(root);
        expect(leaf.useContext(Money)).toBe(500);
    });

    it("falls back to the token default with no provider", () => {
        const leaf = new Rect({ width: 1, height: 1 });
        const root = new Rect({ children: [leaf] });
        bind(root);
        expect(leaf.useContext(Money)).toBe(0);
    });

    it("nested providers shadow nearest-wins", () => {
        const leaf = new Rect({ width: 1, height: 1 });
        const middle = new Rect({ children: [leaf] });
        const inner = new Provider({ context: Money, value: 2, children: [middle] });
        const outer = new Provider({ context: Money, value: 1, children: [inner] });
        bind(outer);
        expect(leaf.useContext(Money)).toBe(2);    // nearest = inner
        expect(middle.useContext(Money)).toBe(2);  // between inner and leaf
        expect(inner.useContext(Money)).toBe(2);   // a provider sees its own value
        expect(outer.useContext(Money)).toBe(1);   // only above inner sees the outer value
    });

    it("supports a reusable, pre-bound provider subclass", () => {
        class MoneyProvider extends Provider<number> {
            protected override resolveContext() { return Money; }
        }
        const leaf = new Rect({ width: 1, height: 1 });
        const root = new MoneyProvider({ value: 42, children: [leaf] });
        bind(root);
        expect(leaf.useContext(Money)).toBe(42);
    });

    it("binds context onto children added after the bind walk", () => {
        const root = new Provider({ context: Money, value: 9 });
        bind(root);
        const late = new Rect({ width: 1, height: 1 });
        root.addChild(late); // addChild pushes context + runs resolveContext immediately
        expect(late.useContext(Money)).toBe(9);
    });
});

describe("ThemeProvider built-in tokens", () => {
    it("provides theme / data / seed and merges nested theme nearest-wins", () => {
        const leaf = new Rect({ width: 1, height: 1 });
        const inner = new ThemeProvider({ theme: { brand: "#0f0" }, children: [leaf] });
        const outer = new ThemeProvider(
            { theme: { brand: "#f00", muted: "#888" }, data: { n: 5 }, seed: "abc", children: [inner] },
        );
        bind(outer);
        expect(leaf.useContext(ThemeToken)).toEqual({ brand: "#0f0", muted: "#888" }); // brand from inner, muted from outer
        expect(leaf.useContext(DataToken)).toEqual({ n: 5 });
        expect(leaf.useContext(SeedToken)).toBe("abc");
    });
});

describe("Node2D.random", () => {
    /** A custom node that records a draw taken in its constructor — the documented
     * author pattern. The constructor runs once per instance and `this.random` is
     * fresh at its seed, so the draw is the head of the seed's sequence. */
    class Draws extends Rect {
        drawn = 0;
        constructor(props: ConstructorParameters<typeof Rect>[0]) {
            super(props);
            this.drawn = this.random.nextFloat();
        }
    }

    it("defaults to seed 0 and is independent per node", () => {
        const a = new Draws({ width: 1, height: 1 });
        const b = new Draws({ width: 1, height: 1 });
        // Same default seed → same head draw; each node has its own source.
        expect(a.drawn).toBe(b.drawn);
        expect(a.drawn).toBe(new Random(0).nextFloat());
    });

    it("a fresh instance reproduces the same draw (the runtime rebuilds per pass)", () => {
        // Each playback pass constructs a new node, so the draw is stable across
        // passes without any per-pass rewind — same seed, same head draw.
        const first = new Draws({ width: 1, height: 1 }).drawn;
        const second = new Draws({ width: 1, height: 1 }).drawn;
        expect(second).toBe(first);
    });

    it("re-seeding via the seed prop changes the draw deterministically", () => {
        // The constructor adopts the seed prop as random's origin before any draw.
        class Seeded extends Rect {
            drawn = 0;
            constructor(props: ConstructorParameters<typeof Rect>[0]) {
                super(props);
                this.drawn = this.random.nextFloat();
            }
        }
        const node = new Seeded({ width: 1, height: 1, seed: 123 });
        expect(node.drawn).toBe(new Random(123).nextFloat());
    });
});

describe("DefaultTextStyle inheritance", () => {
    it("a Text inherits unset style props from the nearest DefaultTextStyle", () => {
        const txt = new Text({ text: "hi" });
        const root = new DefaultTextStyle({ fontSize: 32, fontFamily: "Roboto", children: [txt] });
        bind(root);
        expect(txt.fontSize).toBe(32);
        expect(txt.fontFamily).toBe("Roboto");
    });

    it("an explicitly-set prop on Text wins over the inherited default", () => {
        const txt = new Text({ text: "hi", fontSize: 12 });
        const root = new DefaultTextStyle({ fontSize: 32, children: [txt] });
        bind(root);
        expect(txt.fontSize).toBe(12);
    });

    it("nested DefaultTextStyle merges per key (inner size, outer family)", () => {
        const txt = new Text({ text: "hi" });
        const inner = new DefaultTextStyle({ fontSize: 64, children: [txt] });
        const outer = new DefaultTextStyle({ fontSize: 32, fontFamily: "Inter", children: [inner] });
        bind(outer);
        expect(txt.fontSize).toBe(64);      // nearest
        expect(txt.fontFamily).toBe("Inter"); // from outer
    });

    it("resolves an inherited fill through Text's own mapper", () => {
        const txt = new Text({ text: "hi" });
        const root = new DefaultTextStyle({ fill: "red", children: [txt] });
        bind(root);
        // fill is stored resolved (an array of resolved fills), not the raw string.
        expect(Array.isArray(txt.fill)).toBe(true);
        expect((txt.fill as any[]).length).toBeGreaterThan(0);
    });

    it("inherited defaults apply once on the initial bind", () => {
        const txt = new Text({ text: "hi" });
        const root = new DefaultTextStyle({ fontSize: 32, children: [txt] });
        bind(root);
        expect(txt.fontSize).toBe(32);
    });

    it("a per-frame structural re-push (runResolve=false) does not clobber a mid-pass value", () => {
        const txt = new Text({ text: "hi" });
        const root = new DefaultTextStyle({ fontSize: 32, children: [txt] });
        bind(root);
        expect(txt.fontSize).toBe(32);
        // A generator tween moves the value mid-pass…
        txt.set({ fontSize: 99 });
        expect(txt.fontSize).toBe(99);
        // …and the per-frame re-push (runResolve=false, the way the runtime refreshes
        // context for subtrees added this frame) must NOT re-fire resolveContext and
        // overwrite the in-flight value.
        root.bindContext(ContextMap.EMPTY, false);
        expect(txt.fontSize).toBe(99);
    });
});
