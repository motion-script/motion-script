import { describe, expect, it } from "vitest";

import { Rect } from "@/nodes/geometry/rect-node";
import { Graphics2D } from "@/render/graphics2d";
import { NullRenderContext } from "@/render/null-render-context";
import { AssetTracker } from "@/assets/tracker";
import { AssetCatalog } from "@/assets/catalog";
import { Fills } from "@/attributes/shape/fill/chain";
import { ContextMap } from "@/util/context";

/**
 * The two walk-level skips, and the line between them.
 *
 * Both save real work, and both are only safe because of a distinction that is
 * easy to lose: a context that *paints* cares about what can be seen, while the
 * context that *discovers assets* cares about what is referenced. Conflating them
 * produces a bug with a long fuse — a font that was never requested, on a node
 * that fades in seconds later, reproducing only on a cold load.
 *
 * So each skip is tested in both directions: that it happens where it should, and
 * that it does not happen where it must not.
 */

/**
 * The tracking context with the *painting* capability flipped on.
 *
 * Stands in for a real renderer without stubbing one: `NullRenderContext` is
 * already a complete, concrete `RenderContext2D`, and the only thing that decides
 * whether the invisible-subtree skip applies is `drawsVisibleOnly`. Flipping it
 * exercises exactly the branch a Skia context would take.
 */
class PaintingContext extends NullRenderContext {
    override readonly drawsVisibleOnly = true;
}

/** Runs `body` while counting how many shape ops any node submitted. */
function countingOps(body: () => void): number {
    let ops = 0;
    const original = Graphics2D.prototype.rect;
    Graphics2D.prototype.rect = function (this: Graphics2D, ...args: never[]) {
        ops++;
        return original.apply(this, args as never);
    } as never;
    try {
        body();
    } finally {
        Graphics2D.prototype.rect = original;
    }
    return ops;
}

function laidOut(node: Rect): Rect {
    node.bindContext(ContextMap.EMPTY, true);
    node.layout({ x: 0, y: 0, width: 100, height: 100 }, {
        measureText: () => ({ width: 0, height: 0 }),
    } as never);
    return node;
}

describe("invisible subtrees", () => {
    it("are not drawn by a painting context", () => {
        const hidden = new Rect({ width: 10, height: 10, opacity: 0 });
        const child = new Rect({ width: 5, height: 5 });
        hidden.add(child);
        laidOut(hidden);

        const ctx = new PaintingContext();
        const ops = countingOps(() => hidden.render(ctx));

        // Neither the node nor anything under it: a zero-opacity subtree
        // contributes no pixels, so every draw call it makes is discarded.
        expect(ops).toBe(0);
    });

    it("still declare their assets", () => {
        // The case the skip must not swallow: an invisible node's assets have to
        // be loaded anyway, or the frame it fades in on renders blank.
        //
        // This used to be a property of the *render* pass — a discovery context
        // that refused the invisible-subtree skip so its walk still reached the
        // node. It is now structural instead: declarations come from
        // `prepareRenderAssets`, which walks the tree rather than the draw path,
        // so visibility never enters into it and there is no capability to get
        // wrong.
        const hidden = new Rect({
            width: 10,
            height: 10,
            opacity: 0,
            fill: Fills.image("photo.png"),
        });
        laidOut(hidden);

        const tracker = new AssetTracker(new AssetCatalog({
            image: { "photo.png": { src: "photo.png", width: 8, height: 8, sizeBytes: 0 } },
            video: {}, audio: {}, font: {},
        }));
        tracker.start(0);
        hidden.prepareRenderAssets(tracker);
        tracker.end();

        expect(tracker.assets.get("photo.png")?.type).toBe("image");
    });

    it("draw normally once opacity lifts off zero", () => {
        const node = new Rect({ width: 10, height: 10, opacity: 0.01 });
        laidOut(node);

        const ctx = new PaintingContext();
        const ops = countingOps(() => node.render(ctx));

        expect(ops).toBeGreaterThan(0);
    });
});

describe("bindContext", () => {
    it("stops re-walking a subtree whose context has not changed", () => {
        const root = new Rect({ width: 10, height: 10 });
        const child = new Rect({ width: 5, height: 5 });
        root.add(child);

        let childBinds = 0;
        const original = child.bindContext.bind(child);
        child.bindContext = (parent, runResolve) => {
            childBinds++;
            original(parent, runResolve);
        };

        root.bindContext(ContextMap.EMPTY, false);
        const afterFirst = childBinds;
        // The per-frame re-push, three more times over an unchanged tree.
        root.bindContext(ContextMap.EMPTY, false);
        root.bindContext(ContextMap.EMPTY, false);
        root.bindContext(ContextMap.EMPTY, false);

        // The walk is a whole-tree traversal every frame whose only job is to
        // reach subtrees added since the last one — and insertion already binds
        // those. Repeating it over an unchanged tree is pure repetition.
        expect(childBinds).toBe(afterFirst);
    });

    it("still reaches a child added after the last bind", () => {
        // The thing the per-frame walk exists for, and what the early-out must
        // not break. Insertion binds the newcomer itself, so this asserts the
        // outcome rather than the mechanism.
        const root = new Rect({ width: 10, height: 10 });
        root.bindContext(ContextMap.EMPTY, true);

        const late = new Rect({ width: 5, height: 5 });
        root.add(late);
        root.bindContext(ContextMap.EMPTY, false);

        expect((late as unknown as { _contextBound: boolean })._contextBound).toBe(true);
    });
});
