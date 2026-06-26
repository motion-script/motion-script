import { describe, it, expect } from 'vitest';
import { Image } from '@/nodes/media/image-node';
import { Video } from '@/nodes/media/video-node';
import { Clip } from '@/render/clip';
import type { RenderContext } from '@/render/render-context';
import type { BoxBounds } from '@/attributes/layout/bounds';

/**
 * Records the clip scopes a media node opens during render so we can assert the
 * begin/end balance — and that the clipPath wraps both the node's own paint and
 * its children — without a real CanvasKit surface. Mirrors the recorder in
 * `geometry/clip.test.ts`; every other method the render path touches is a no-op.
 */
class ClipRecorderContext {
    clips: Clip[] = [];
    depth = 0;
    /** Order of begin/draw/end events, so we can prove the clip brackets renderSelf. */
    events: string[] = [];

    beginClip(clip: Clip): void {
        this.clips.push(clip);
        this.depth++;
        this.events.push('beginClip');
    }
    endClip(): void {
        this.depth--;
        this.events.push('endClip');
    }
    draw(): void { this.events.push('draw'); }

    transform(): this { return this; }
    begin(): void { }
    end(): void { }
    beginEffectScope(): void { }
    endEffectScope(): void { }

    asCtx(): RenderContext {
        return this as unknown as RenderContext;
    }
}

const RECT: BoxBounds = { x: 0, y: 0, width: 200, height: 120 };

function setLayout(node: { layout: (r: BoxBounds, s: any) => void }, rect: BoxBounds): void {
    node.layout(rect, {} as any);
}

/** A clipPath punching a slot out of an ellipse — a compound (cut) outline. */
function slotClip(): Clip {
    return new Clip()
        .ellipse({ width: 160, height: 160 })
        .rect({ y: 40, width: 200, height: 40 })
        .cut();
}

describe.each([
    ['Image', () => new Image({ src: 'photo.png', clipPath: slotClip() })],
    ['Video', () => new Video({ src: 'clip.mp4', clipPath: slotClip() })],
])('%s clipPath cuts through self + children', (_name, make) => {
    it('opens one balanced clip that brackets the node\'s own paint (renderSelf)', () => {
        const node = make();
        setLayout(node, RECT);

        const ctx = new ClipRecorderContext();
        node.onRender(ctx.asCtx());

        // Exactly one clip, and it stays balanced.
        expect(ctx.clips).toHaveLength(1);
        expect(ctx.depth).toBe(0);

        // The clip opens *before* renderSelf draws and closes *after* — so the
        // image/video frame itself is cut, not just the children.
        const firstDraw = ctx.events.indexOf('draw');
        expect(ctx.events[0]).toBe('beginClip');
        expect(firstDraw).toBeGreaterThan(0);
        expect(ctx.events[ctx.events.length - 1]).toBe('endClip');

        // It's the compound (ellipse + rect + cut) outline the author supplied.
        const ops = ctx.clips[0].ops();
        expect(ops.map(o => o.kind)).toEqual(['ellipse', 'rect', 'cut']);
    });
});

describe.each([
    ['Image', (clipPath?: Clip) => new Image({ src: 'photo.png', clipPath })],
    ['Video', (clipPath?: Clip) => new Video({ src: 'clip.mp4', clipPath })],
])('%s without clipPath opens no clip', (_name, make) => {
    it('no clipPath → no clip scope, stays balanced', () => {
        const node = make(undefined);
        setLayout(node, RECT);

        const ctx = new ClipRecorderContext();
        node.onRender(ctx.asCtx());

        expect(ctx.clips).toHaveLength(0);
        expect(ctx.depth).toBe(0);
    });

    it('an empty clipPath (only a cut, no shapes) opens no clip', () => {
        const node = make(new Clip().cut());
        setLayout(node, RECT);

        const ctx = new ClipRecorderContext();
        node.onRender(ctx.asCtx());

        expect(ctx.clips).toHaveLength(0);
        expect(ctx.depth).toBe(0);
    });
});
