import { describe, it, expect } from 'vitest';
import { Row } from '@/nodes/layout/row-node';
import { Column } from '@/nodes/layout/column-node';
import { Clip } from '@/render/clip';
import type { RenderContext } from '@/render/render-context';
import type { BoxBounds } from '@/attributes/layout/bounds';

/**
 * Records the clip / effect-scope calls a node issues during render so tests can
 * assert the begin/end balance without a real CanvasKit surface. Mirrors the
 * recorder used in geometry/clip.test.ts; every other RenderContext method the
 * node render path touches is a no-op.
 */
class RecorderContext {
    clips: Clip[] = [];
    depth = 0;
    effectScopes = 0;
    private effectDepth = 0;

    beginClip(clip: Clip): void { this.clips.push(clip); this.depth++; }
    endClip(): void { this.depth--; }
    beginEffectScope(): void { this.effectScopes++; this.effectDepth++; }
    endEffectScope(): void { this.effectDepth--; }
    get effectBalance(): number { return this.effectDepth; }

    transform(): this { return this; }
    draw(): void { }
    begin(): void { }
    end(): void { }

    asCtx(): RenderContext { return this as unknown as RenderContext; }
}

function setLayout(node: { layout: (r: BoxBounds, s: any) => void }, rect: BoxBounds): void {
    node.layout(rect, {} as any);
}

const RECT: BoxBounds = { x: 0, y: 0, width: 200, height: 120 };

// Row and Column draw no box of their own, but they expose a rectangular outline
// (their layout rect) so they clip and confine effects exactly like a Rect. These
// tests lock that parity in — without it, `clip` and backdrop effects silently
// no-op on a pure layout container.
describe('Row/Column clip and effect area (rectangle parity)', () => {
    for (const Container of [Row, Column]) {
        describe(Container.name, () => {
            it('exposes a rect outline via clipSelf()', () => {
                const node = new Container({});
                setLayout(node, RECT);
                const clip = (node as any).clipSelf() as Clip;
                expect(clip.isEmpty()).toBe(false);
                expect(clip.ops()[0].kind).toBe('rect');
            });

            it('clip=true opens exactly one balanced clip around children', () => {
                const node = new Container({ clip: true });
                setLayout(node, RECT);
                const ctx = new RecorderContext();
                node.onRender(ctx.asCtx());
                expect(ctx.clips).toHaveLength(1);
                expect(ctx.clips[0].ops()[0].kind).toBe('rect');
                expect(ctx.depth).toBe(0);
            });

            it('clip=false opens no clip scope', () => {
                const node = new Container({ clip: false });
                setLayout(node, RECT);
                const ctx = new RecorderContext();
                node.onRender(ctx.asCtx());
                expect(ctx.clips).toHaveLength(0);
                expect(ctx.depth).toBe(0);
            });

            it('confines a backdrop effect to its own outline', () => {
                const node = new Container({ effects: [{ type: 'blur', blur: 8, backdrop: true }] });
                setLayout(node, RECT);
                const ctx = new RecorderContext();
                node.onRender(ctx.asCtx());
                // Backdrop scope is clipped to the node rect, and stays balanced.
                expect(ctx.clips.length).toBeGreaterThanOrEqual(1);
                expect(ctx.clips[0].ops()[0].kind).toBe('rect');
                expect(ctx.depth).toBe(0);
                expect(ctx.effectBalance).toBe(0);
            });

            it('opens a foreground shader-effect scope for posterize/bulge', () => {
                const node = new Container({ effects: [{ type: 'posterize', level: 4 }] });
                setLayout(node, RECT);
                const ctx = new RecorderContext();
                node.onRender(ctx.asCtx());
                expect(ctx.effectScopes).toBeGreaterThanOrEqual(1);
                expect(ctx.effectBalance).toBe(0);
            });

            it('no effects and clip=false opens nothing', () => {
                const node = new Container({});
                setLayout(node, RECT);
                const ctx = new RecorderContext();
                node.onRender(ctx.asCtx());
                expect(ctx.clips).toHaveLength(0);
                expect(ctx.effectScopes).toBe(0);
                expect(ctx.depth).toBe(0);
            });
        });
    }
});
