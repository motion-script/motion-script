import { describe, expect, it } from "vitest";

import { Node2D } from "@/nodes/2d/node2d";
import { Rect } from "@/nodes/geometry/rect-node";
import { Graphics2D } from "@/render/graphics2d";
import { NullRenderContext } from "@/render/null-render-context";
import { NodeTransform3D } from "@/attributes/layout/transform3d";
import { isProjective } from "@/attributes/layout/matrix2d";
import type { TransformState } from "@/render/descriptors/transform";
import type { RenderContext2D } from "@/render/render-context2d";
import { attachScope, attached } from "@/nodes/node/node.fixtures";
import { FakeMeasurer } from "@/runtime/runtime.fixtures";

/**
 * Mirrors, tilt, depth and the backface — the flat-node half of CSS's 3D
 * transforms.
 *
 * The line these tests are really drawn around is the one between the two places
 * a node's transform is computed: `applyTransform`, which the renderer draws
 * through, and `_localMatrix`, which `global` and hit testing read. They are the
 * same arithmetic with one argument's difference — the renderer applies the
 * out-of-plane half and the geometry does not — so the suite checks both ends,
 * that the projection reaches the canvas and that it reaches nothing else.
 */

const scope = new FakeMeasurer();

/** A leaf whose layout cell can be set directly, mirroring what a parent would assign. */
class Tile extends Node2D {
    constructor(props?: any) {
        super(props ?? {});
    }
    place(rect: { x: number; y: number; width: number; height: number }): this {
        this.layout(rect, scope);
        return this;
    }
}

function closeTo(actual: number, expected: number, eps = 1e-6): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

describe("transform3D — the shorthand", () => {
    it("expands onto the individual props at construction", () => {
        const bag: NodeTransform3D = {
            rotationX: 45,
            rotationY: -17,
            depth: 488,
            perspective: 422,
            backfaceVisible: false,
            flipHorizontal: true,
        };
        const n = new Tile({ transform3D: bag });

        expect(n.rotationX).toBe(45);
        expect(n.rotationY).toBe(-17);
        expect(n.depth).toBe(488);
        expect(n.perspective).toBe(422);
        expect(n.backfaceVisible).toBe(false);
        expect(n.flipHorizontal).toBe(true);
    });

    it("renames only `origin`, which lands on transformOrigin", () => {
        const n = new Tile({ transform3D: { origin: "topLeft" } });
        expect(n.transformOrigin).toEqual({ x: -1, y: 1 });
    });

    it("lets an explicitly named prop win over the bag's field", () => {
        // The same precedence `size` vs `width` has: the specific beats the sugar.
        const n = new Tile({ rotationY: 10, transform3D: { rotationX: 5, rotationY: 90 } });
        expect(n.rotationY).toBe(10);
        expect(n.rotationX).toBe(5);
    });

    it("writes through set() the same way", () => {
        const n = new Tile({});
        n.set({ transform3D: { rotationY: 33, perspective: 900 } } as never);
        expect(n.rotationY).toBe(33);
        expect(n.perspective).toBe(900);
    });

    it("tweens its fields individually through to()", () => {
        const n = attached(new Tile({ rotationY: 0 }));
        const step = n.to({ transform3D: { rotationY: 180 } } as never, 1)._stepper() as
            TweenStepper;
        step.seek(0);
        let done = false;
        while (!done) done = step.advance(0.5);
        expect(n.rotationY).toBe(180);
    });

    it("leaves every field alone by default", () => {
        const n = new Tile({});
        expect(n.rotationX).toBe(0);
        expect(n.rotationY).toBe(0);
        expect(n.depth).toBe(0);
        expect(n.perspective).toBe(0);
        expect(n.flipHorizontal).toBe(false);
        expect(n.flipVertical).toBe(false);
        expect(n.backfaceVisible).toBe(true);
        expect(n.transformOrigin).toBeUndefined();
    });
});

describe("transform3D — the geometry stays flat", () => {
    /**
     * The whole contract, from the reading side: a mirrored or tilted node goes
     * on measuring, reporting and hit-testing as the upright rectangle it was.
     *
     * Not an omission — see `Node2D._localMatrix`. Everything that reads a node's
     * box reads it to put a handle on, and a selection outline, a resize grip or
     * an alignment target all mean something on a rectangle and stop meaning it
     * on a trapezoid. So the projection reaches the canvas and nothing else.
     */
    const flat = (): unknown => {
        const plain = new Tile({}).place({ x: 0, y: 0, width: 200, height: 40 })
        return JSON.stringify(plain.global)
    }

    it("reports the same world box mirrored as upright", () => {
        const n = new Tile({ flipHorizontal: true, flipVertical: true })
            .place({ x: 0, y: 0, width: 200, height: 40 })
        expect(JSON.stringify(n.global)).toBe(flat());
    });

    it("reports the same world box tilted as face-on", () => {
        const n = new Tile({ rotationX: 35, rotationY: -60, depth: 120, perspective: 500 })
            .place({ x: 0, y: 0, width: 200, height: 40 })
        expect(JSON.stringify(n.global)).toBe(flat());
    });

    it("still folds in the ordinary transform, tilt or no tilt", () => {
        // The flatness is about the out-of-plane half only: position, rotation
        // and scale go on doing exactly what they did.
        const n = new Tile({ x: 50, scale: 2, rotationY: 60, perspective: 400 })
            .place({ x: 0, y: 0, width: 200, height: 40 })
        closeTo(n.global.topRight.x, 50 + 200);
        closeTo(n.global.center.x, 50);
    });

    it("keeps the local matrix affine however far the node is tilted", () => {
        const n = new Tile({ rotationX: 70, rotationY: 40, depth: 300, perspective: 250 })
            .place({ x: 0, y: 0, width: 200, height: 40 })
        expect(isProjective(n._localMatrix())).toBe(false);
    });

    it("does follow transformOrigin, which moves the node for real", () => {
        // The one field of the section that is geometry rather than paint: it
        // changes where the *2D* rotation turns about, so the node genuinely
        // ends up somewhere else and every box has to say so.
        const hinged = new Tile({ rotation: 90, transformOrigin: "centerLeft" })
            .place({ x: 0, y: 0, width: 200, height: 40 })
        closeTo(hinged.global.center.x, -100);
        closeTo(hinged.global.center.y, -100);
    });
});

/** A painting context that keeps every transform state pushed through it. */
class RecordingContext extends NullRenderContext {
    override readonly drawsVisibleOnly = true;
    readonly states: Partial<TransformState>[] = [];
    override transform(state: Partial<TransformState>): RenderContext2D {
        // The scratch is reused per node per frame, so snapshot rather than retain.
        this.states.push({ ...state });
        return super.transform(state);
    }
}

function laidOut(node: Rect): Rect {
    node.attach(attachScope());
    node.layout({ x: 0, y: 0, width: 100, height: 100 }, scope as never);
    return node;
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

describe("transform3D — what reaches the renderer", () => {
    it("sends no matrix for a node that stays in its own plane", () => {
        const node = laidOut(new Rect({ width: 40, height: 40, rotation: 30, scale: 2 }));
        const ctx = new RecordingContext();
        node.render(ctx);
        // The decomposed translate/rotate/scale path, untouched.
        expect(ctx.states[0].matrix).toBeUndefined();
    });

    it("sends a projected matrix once out of plane, and keeps the geometry flat", () => {
        const node = laidOut(new Rect({
            width: 40, height: 40, rotation: 30, scale: 2,
            rotationX: 25, rotationY: -40, depth: 70, perspective: 600,
        }));
        const ctx = new RecordingContext();
        node.render(ctx);

        const pushed = ctx.states[0].matrix;
        expect(pushed).toBeDefined();
        expect(isProjective(pushed!)).toBe(true);
        // …and the geometry is not it: the flat matrix `global` and picking read
        // has no perspective row and no tilt in it at all.
        expect(isProjective(node._localMatrix())).toBe(false);
        expect(pushed).not.toEqual(node._localMatrix());
    });

    it("sends a matrix for a mere mirror too, since the decomposed fields cannot say it", () => {
        const node = laidOut(new Rect({ width: 40, height: 40, flipVertical: true }));
        const ctx = new RecordingContext();
        node.render(ctx);
        expect(ctx.states[0].matrix).toBeDefined();
        // Still affine — a mirror needs no perspective row.
        expect(isProjective(ctx.states[0].matrix!)).toBe(false);
    });
});

describe("transform3D — a mirror does not move the node", () => {
    /**
     * The bug this guards: a flip is a reflection *about the node's own origin*,
     * so the node comes out reversed and stays exactly where it was. Nothing
     * about its position, its box or the number in a position field may move —
     * on the canvas or in a panel reading it back.
     */
    const translationOf = (node: Rect): { x: number; y: number } => {
        const ctx = new RecordingContext();
        node.render(ctx);
        const s = ctx.states[0];
        const m = s.matrix;
        // Either path is answering the same question: where the node's own
        // origin landed. The decomposed one says it in x/y, the matrix one in e/f.
        return m ? { x: m.e, y: m.f } : { x: s.x ?? 0, y: s.y ?? 0 };
    };

    it("leaves the origin where it was under either mirror", () => {
        const upright = translationOf(laidOut(new Rect({ width: 40, height: 40, x: 30, y: -20 })));
        for (const mirror of [{ flipHorizontal: true }, { flipVertical: true }, { flipHorizontal: true, flipVertical: true }]) {
            const mirrored = translationOf(
                laidOut(new Rect({ width: 40, height: 40, x: 30, y: -20, ...mirror }))
            );
            closeTo(mirrored.x, upright.x);
            closeTo(mirrored.y, upright.y);
        }
    });

    it("mirrors the axis it names and only that one", () => {
        const ctx = new RecordingContext();
        laidOut(new Rect({ width: 40, height: 40, flipVertical: true })).render(ctx);
        const m = ctx.states[0].matrix!;
        // A vertical mirror is a negative y scale and nothing else — no rotation
        // in the off-diagonals, and no translation to go with it.
        closeTo(m.a, 1);
        closeTo(m.b, 0);
        closeTo(m.c, 0);
        closeTo(m.d, -1);
    });

    it("does not move it in the document either", () => {
        const flat = new Tile({ x: 30, y: -20 }).place({ x: 0, y: 0, width: 40, height: 40 });
        const flipped = new Tile({ x: 30, y: -20, flipVertical: true })
            .place({ x: 0, y: 0, width: 40, height: 40 });
        expect(flipped.y).toBe(flat.y);
        expect(flipped.global.y).toBe(flat.global.y);
        expect(flipped.global.center).toEqual(flat.global.center);
    });
});

describe("transform3D — backfaceVisible", () => {
    it("keeps painting a node that has turned past edge-on, by default", () => {
        const node = laidOut(new Rect({ width: 40, height: 40, rotationY: 180 }));
        expect(countingOps(() => node.render(new RecordingContext()))).toBeGreaterThan(0);
    });

    it("skips the node and its whole subtree once it is showing its back", () => {
        const node = new Rect({ width: 40, height: 40, rotationY: 180, backfaceVisible: false });
        node.add(new Rect({ width: 10, height: 10 }));
        laidOut(node);
        expect(countingOps(() => node.render(new RecordingContext()))).toBe(0);
    });

    it("paints it again as soon as the tilt brings it back round", () => {
        const node = laidOut(new Rect({ width: 40, height: 40, rotationY: 45, backfaceVisible: false }));
        expect(countingOps(() => node.render(new RecordingContext()))).toBeGreaterThan(0);
    });

    it("does not hide a node that is merely mirrored", () => {
        // CSS derives the answer from the accumulated matrix, where scaleX(-1)
        // inverts orientation and takes the element with it. A flip here is a
        // flip, not a turn — see `facesAway`.
        const node = laidOut(new Rect({
            width: 40, height: 40, flipHorizontal: true, backfaceVisible: false,
        }));
        expect(countingOps(() => node.render(new RecordingContext()))).toBeGreaterThan(0);
    });
});
