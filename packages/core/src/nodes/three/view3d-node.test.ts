import { describe, it, expect } from 'vitest';
import { View3D } from '@/nodes/three/view3d-node';
import { Graphics } from '@/render/graphics';
import { Graphics3D } from '@/render3d/graphics3d';
import { resolveFillArray } from '@/attributes/shape/fill/registry';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { View3DFillResolved } from '@/attributes/shape/fill/implementations/view3d';
import type { FillResolved } from '@/attributes/shape/fill/union';
import type { RenderContext } from '@/render/render-context';
import type { BoxBounds } from '@/attributes/layout/bounds';

/**
 * Captures the `Graphics` a node submits, so the op list can be asserted without
 * a CanvasKit surface or a GPU. Mirrors `ClipRecorderContext` in
 * `geometry/clip.test.ts`.
 */
class DrawRecorderContext {
    draws: Graphics[] = [];

    draw(graphics: Graphics): void {
        this.draws.push(graphics);
    }

    /** Every other method the ShapeNode render path touches. */
    transform(): this { return this; }
    begin(): void { }
    end(): void { }
    beginClip(): void { }
    endClip(): void { }
    beginEffectScope(): void { }
    endEffectScope(): void { }

    asCtx(): RenderContext {
        return this as unknown as RenderContext;
    }

    /** The op kinds of every submitted Graphics, flattened in draw order. */
    kinds(): string[] {
        return this.draws.flatMap((g) => g.ops().map((op) => op.kind));
    }

    /** The resolved fill layers of the first submitted Graphics. */
    fills(): FillResolved[] {
        const op = this.draws[0].ops().find((o) => o.kind === 'fill');
        return op ? resolveFillArray((op as { fills: never }).fills) : [];
    }

    /** The 3D layer, if the node appended one. */
    view3D(): View3DFillResolved | undefined {
        return this.fills().find((f) => f.type === 'view3D') as View3DFillResolved | undefined;
    }
}

const RECT: BoxBounds = { x: 0, y: 0, width: 800, height: 600 };

function render(node: View3D): DrawRecorderContext {
    node.layout(RECT, {} as never);
    const ctx = new DrawRecorderContext();
    (node as unknown as { renderSelf(c: RenderContext): void }).renderSelf(ctx.asCtx());
    return ctx;
}

const boxScene = () => new Graphics3D().box();

describe('View3D', () => {
    // 3D is a fill layer now, not an op of its own — so the op list is a plain
    // rect's and the scene rides in the `fill`.
    it('appends the scene as a fill layer rather than a separate op', () => {
        const ctx = render(new View3D({ graphics3D: boxScene() }));

        expect(ctx.draws).toHaveLength(1);
        expect(ctx.kinds()).toEqual(['rect', 'shadow', 'fill']);
        expect(ctx.view3D()).toBeDefined();
    });

    it("paints the author's own fill layers beneath the 3D", () => {
        const ctx = render(new View3D({ graphics3D: boxScene(), fill: '#0b0d12' }));

        // Array order is paint order.
        expect(ctx.fills().map((f) => f.type)).toEqual(['solid', 'view3D']);
    });

    it('carries the scene, maxPixelRatio and antialias onto the fill', () => {
        const g3 = boxScene();
        const ctx = render(new View3D({ graphics3D: g3, maxPixelRatio: 1, antialias: false }));

        expect(ctx.view3D()).toMatchObject({ graphics3D: g3, maxPixelRatio: 1, antialias: false });
    });

    it('appends nothing when there is no scene to draw', () => {
        // No scene at all — just a Rect.
        expect(render(new View3D({})).view3D()).toBeUndefined();
        // Nor when the scene only sets settings, which draw nothing.
        const settingsOnly = new Graphics3D().perspective().background('red');
        expect(render(new View3D({ graphics3D: settingsOnly })).view3D()).toBeUndefined();
    });

    it('throws on an unbalanced group rather than silently reparenting', () => {
        const node = new View3D({ graphics3D: new Graphics3D().push().box() });
        expect(() => render(node)).toThrow(/unclosed push/);
    });

    it('supports a subclass overriding buildGraphics3D instead of passing a scene', () => {
        class Turntable extends View3D {
            protected override buildGraphics3D(): Graphics3D {
                return new Graphics3D().torus({ radius: 1.5 });
            }
        }

        expect(render(new Turntable({})).view3D()?.graphics3D.ops()).toHaveLength(1);
    });

    // The whole reason `graphics3D` takes a value rather than a builder: it can be
    // an ordinary signal-backed @property, so `set()` reaches it.
    it('is a signal-backed property, so set({ graphics3D }) works', () => {
        const node = new View3D({ graphics3D: boxScene() });
        expect(render(node).view3D()?.graphics3D.ops()).toHaveLength(1);

        node.set({ graphics3D: new Graphics3D().sphere().sphere() });
        expect(render(node).view3D()?.graphics3D.ops()).toHaveLength(2);
    });

    it('accepts a reactive binding', () => {
        const node = new View3D({ graphics3D: () => new Graphics3D().box().box().box() });
        expect(render(node).view3D()?.graphics3D.ops()).toHaveLength(3);
    });

    // The property the whole design rests on: the descriptor is a pure function of
    // the frame, so re-rendering the same frame produces the same scene. That is
    // what makes scrubbing and export frame-identical.
    it('produces structurally equal descriptors for two renders at the same frame', () => {
        class Spinner extends View3D {
            protected override buildGraphics3D(): Graphics3D {
                return new Graphics3D()
                    .perspective({ position: [0, 0, 5] })
                    .box({ rotation: [0, this.clock.elapsed * 90, 0] });
            }
        }
        const node = new Spinner({});

        const first = render(node).view3D()!.graphics3D;
        const second = render(node).view3D()!.graphics3D;

        expect(first.ops()).toEqual(second.ops());
        expect(first.cameraDescriptor()).toEqual(second.cameraDescriptor());
    });

    it('hands out a fresh recorder each render, so ops never accumulate', () => {
        class Two extends View3D {
            protected override buildGraphics3D(): Graphics3D {
                return new Graphics3D().box().sphere();
            }
        }
        const node = new Two({});

        expect(render(node).view3D()?.graphics3D.ops()).toHaveLength(2);
        expect(render(node).view3D()?.graphics3D.ops()).toHaveLength(2);
    });

    // A 3D viewport has no intrinsic size and shouldn't be sized by an overlay
    // child — hugging a HUD label would collapse the viewport to the text.
    it('defaults to filling on both axes, even with children', () => {
        const bare = new View3D({});
        expect(bare.width).toBe('fill');
        expect(bare.height).toBe('fill');

        const withChild = new View3D({ children: [new View3D({ width: 10, height: 10 })] });
        expect(withChild.width).toBe('fill');
        expect(withChild.height).toBe('fill');

        const explicit = new View3D({ width: 640, height: 480 });
        expect(explicit.width).toBe(640);
        expect(explicit.height).toBe(480);
    });

    it('declares the runtime without throwing when no backend has registered one', () => {
        // Core must stay usable headless — the warmup seam is filled in by the
        // backend, and its absence can't throw. The declaration still lands on the
        // timeline; running it is the manager's problem, and `warmView3D` no-ops.
        const tracker = new AssetTracker(new AssetCatalog({ image: {}, video: {}, audio: {}, font: {} }));
        tracker.start(0);
        expect(() => new View3D({}).prepareRender(tracker)).not.toThrow();
        tracker.end();

        expect(tracker.assets.get('three:runtime')?.type).toBe('loader');
    });
});
