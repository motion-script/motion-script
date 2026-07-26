import { describe, it, expect, vi } from 'vitest';
import { Scene3D } from '@/nodes/three/scene3d-node';
import { Graphics } from '@/render/graphics';
import { Graphics3D } from '@/render3d/graphics3d';
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
}

const RECT: BoxBounds = { x: 0, y: 0, width: 800, height: 600 };

function render(node: Scene3D): DrawRecorderContext {
    node.layout(RECT, {} as never);
    const ctx = new DrawRecorderContext();
    (node as unknown as { renderSelf(c: RenderContext): void }).renderSelf(ctx.asCtx());
    return ctx;
}

describe('Scene3D', () => {
    it('emits the 3D composite as an op after the 2D paint, in one draw', () => {
        const node = new Scene3D({ scene: (g) => g.box() });
        const ctx = render(node);

        // One draw call: the rect carries the node's own paint and doubles as the
        // destination for the composite, so `fill` lands beneath the 3D.
        expect(ctx.draws).toHaveLength(1);
        expect(ctx.kinds()).toEqual(['rect', 'shadow', 'fill', 'scene3D']);
    });

    it('sizes the composite to the layout rect', () => {
        const node = new Scene3D({ scene: (g) => g.box() });
        const ctx = render(node);

        const op = ctx.draws[0].ops().find((o) => o.kind === 'scene3D');
        expect(op).toMatchObject({ state: { width: 800, height: 600 } });
    });

    it('carries cornerRadius/cornerStyle so the composite can be clipped to match', () => {
        const node = new Scene3D({ scene: (g) => g.box(), cornerRadius: 24, cornerStyle: 'angled' });
        const ctx = render(node);

        // Rect's @property mappers expand the loose scalar into the per-corner
        // resolved form, so the op carries that rather than the authored `24`.
        const op = ctx.draws[0].ops().find((o) => o.kind === 'scene3D');
        expect(op).toMatchObject({
            state: {
                cornerRadius: { topLeft: 24, topRight: 24, bottomLeft: 24, bottomRight: 24 },
                cornerStyle: {
                    topLeft: 'angled', topRight: 'angled',
                    bottomLeft: 'angled', bottomRight: 'angled',
                },
            },
        });
    });

    it('records no 3D op when the builder draws nothing', () => {
        // A Scene3D with no builder is just a Rect — the renderer should never be
        // asked for a GPU context.
        expect(render(new Scene3D({})).kinds()).toEqual(['rect', 'shadow', 'fill']);
        // Nor when the builder only sets scene settings, which draw nothing.
        const settingsOnly = new Scene3D({ scene: (g) => g.perspective().background('red') });
        expect(render(settingsOnly).kinds()).toEqual(['rect', 'shadow', 'fill']);
    });

    it('invokes the builder exactly once per render', () => {
        const build = vi.fn((g: Graphics3D) => g.box());
        const node = new Scene3D({ scene: build });

        render(node);
        expect(build).toHaveBeenCalledTimes(1);
        render(node);
        expect(build).toHaveBeenCalledTimes(2);
    });

    it('hands the builder a fresh recorder each frame, so ops never accumulate', () => {
        const node = new Scene3D({ scene: (g) => g.box().sphere() });

        const first = render(node);
        const second = render(node);

        const opsOf = (ctx: DrawRecorderContext) => {
            const op = ctx.draws[0].ops().find((o) => o.kind === 'scene3D');
            return (op as { graphics: Graphics3D }).graphics.ops();
        };
        expect(opsOf(first)).toHaveLength(2);
        expect(opsOf(second)).toHaveLength(2);
    });

    // The property the whole design rests on: the descriptor is a pure function of
    // the frame, so re-rendering the same frame produces the same scene. That is
    // what makes scrubbing and export frame-identical.
    it('produces structurally equal descriptors for two renders at the same frame', () => {
        const node = new Scene3D({
            scene: (g, t) => g
                .perspective({ position: [0, 0, 5] })
                .box({ rotation: [0, t * 90, 0] }),
        });

        const first = render(node);
        const second = render(node);

        const graphicsOf = (ctx: DrawRecorderContext) => {
            const op = ctx.draws[0].ops().find((o) => o.kind === 'scene3D');
            return (op as { graphics: Graphics3D }).graphics;
        };
        expect(graphicsOf(first).ops()).toEqual(graphicsOf(second).ops());
        expect(graphicsOf(first).cameraDescriptor()).toEqual(graphicsOf(second).cameraDescriptor());
    });

    it('throws on an unbalanced group rather than silently reparenting', () => {
        const node = new Scene3D({ scene: (g) => g.push().box() });
        expect(() => render(node)).toThrow(/unclosed push/);
    });

    it('supports a subclass overriding scene3D instead of passing a builder', () => {
        class Turntable extends Scene3D {
            protected override scene3D(g: Graphics3D): Graphics3D {
                return g.torus({ radius: 1.5 });
            }
        }

        const ctx = render(new Turntable({}));
        expect(ctx.kinds()).toEqual(['rect', 'shadow', 'fill', 'scene3D']);
    });

    // `scene` is read into a plain field because Node._writeProp would treat a
    // function prop as a reactive binding and call it with no arguments. The
    // consequence is that `set()` can't reach it, so `setScene` exists.
    it('swaps the builder via setScene, since set({ scene }) cannot reach it', () => {
        const node = new Scene3D({ scene: (g) => g.box() });

        node.set({ scene: (g: Graphics3D) => g.sphere().sphere() } as never);
        const afterSet = render(node);
        let ops = (afterSet.draws[0].ops().find((o) => o.kind === 'scene3D') as { graphics: Graphics3D }).graphics.ops();
        expect(ops).toHaveLength(1);   // still the original one-box builder

        node.setScene((g) => g.sphere().sphere());
        const afterSetScene = render(node);
        ops = (afterSetScene.draws[0].ops().find((o) => o.kind === 'scene3D') as { graphics: Graphics3D }).graphics.ops();
        expect(ops).toHaveLength(2);
    });

    // A 3D viewport has no intrinsic size and shouldn't be sized by an overlay
    // child — hugging a HUD label would collapse the viewport to the text.
    it('defaults to filling on both axes, even with children', () => {
        const bare = new Scene3D({});
        expect(bare.width).toBe('fill');
        expect(bare.height).toBe('fill');

        const withChild = new Scene3D({ children: [new Scene3D({ width: 10, height: 10 })] });
        expect(withChild.width).toBe('fill');
        expect(withChild.height).toBe('fill');

        const explicit = new Scene3D({ width: 640, height: 480 });
        expect(explicit.width).toBe(640);
        expect(explicit.height).toBe(480);
    });

    it('prepareRender is a no-op when no rendering backend has registered a 3D runtime', () => {
        // Core must stay usable headless — the warmup seam is filled in by the
        // backend, and its absence can't throw.
        expect(() => new Scene3D({}).prepareRender()).not.toThrow();
    });
});
