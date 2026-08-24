import { describe, expect, it } from "vitest";

import { Rect } from "@/nodes/geometry/rect-node";
import { Graphics2D } from "@/render/graphics2d";
import { NullRenderContext } from "@/render/null-render-context";
import { CanvasAssetTracker } from "@/assets/tracker";
import { ManifestAssetCatalog } from "@/assets/catalog";
import { Fills } from "@/attributes/shape/fill/chain";
import { attachScope } from "@/nodes/node/node.fixtures";
import { declareRenderAssets } from "@/nodes/node/node-walk";

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
    node.attach(attachScope());
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

        const tracker = new CanvasAssetTracker(new ManifestAssetCatalog({
            image: { "photo.png": { src: "photo.png", width: 8, height: 8, sizeBytes: 0 } },
            video: {}, audio: {}, font: {},
        }));
        tracker.start(0);
        declareRenderAssets(hidden, tracker);
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

describe("attach", () => {
    it("resolves context once per node however often the tree is attached", () => {
        // `resolveContext` applies inherited *values* to already-built structure,
        // so re-firing it every frame would overwrite whatever a tween had moved
        // since. The runtime re-attaches on every frame; this is what makes that
        // safe.
        let resolves = 0;
        class Counting extends Rect {
            protected override resolveContext(): void { resolves++; }
        }
        const root = new Rect({ width: 10, height: 10 });
        root.add(new Counting({ width: 5, height: 5 }));

        root.attach(attachScope(0));
        expect(resolves).toBe(1);
        root.attach(attachScope(1));
        root.attach(attachScope(2));
        expect(resolves).toBe(1);
    });

    it("mounts a child added after the last walk, on insertion", () => {
        // A generator adds nodes mid-frame, after the frame's attach has already
        // run. Insertion attaches the newcomer itself, so the mount guards do not
        // skip the very node that was just created.
        const root = new Rect({ width: 10, height: 10 });
        root.attach(attachScope());

        const late = new Rect({ width: 5, height: 5 });
        root.add(late);

        expect(late.mounted).toBe(true);
    });

    it("unmounts a subtree on removal", () => {
        const root = new Rect({ width: 10, height: 10 });
        const child = new Rect({ width: 5, height: 5 });
        const grandchild = new Rect({ width: 2, height: 2 });
        child.add(grandchild);
        root.add(child);
        root.attach(attachScope());
        expect(grandchild.mounted).toBe(true);

        root.remove(child);
        expect(child.mounted).toBe(false);
        expect(grandchild.mounted).toBe(false);
    });
});
