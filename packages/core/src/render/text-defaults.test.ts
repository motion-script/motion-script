import { describe, it, expect, afterEach } from 'vitest';
import { Graphics } from '@/render/graphics';
import { RenderContext } from '@/render/render-context';
import { TrackRenderContext } from '@/render/track-render-context';
import { AssetTracker } from '@/assets/tracker';
import { AssetCatalog } from '@/assets/catalog';
import type { AssetManifest } from '@/assets/manifest';
import { Node } from '@/nodes/base/node';
import { DefaultTextStyle } from '@/nodes/text/default-text-style-node';
import { Text } from '@/nodes/text/text-node';
import { setTheme } from '@/attributes/shape/fill/color/parser';
import { ContextMap } from '@/util/context';
import { FakeMeasureScope } from '@/runtime/runtime.fixtures';
import type { TextState } from '@/render/descriptors/text';
import type { RichTextState } from '@/render/descriptors/richtext';
import type { ResolvedTextSpan } from '@/attributes/text/span';

const scope = new FakeMeasureScope();

/** A `RenderContext` that records the op lists reaching the backend seam, so a
 *  test can assert what a draw actually resolved to without a surface. */
class RecorderContext extends RenderContext {
    readonly drawn: Graphics[] = [];

    protected drawGraphics(graphics: Graphics): void {
        this.drawn.push(graphics);
    }

    /** The state of the single `text` op in the nth recorded draw. */
    textState(index = 0): Partial<TextState> {
        const op = this.drawn[index]?.ops().find((o) => o.kind === 'text');
        if (!op || op.kind !== 'text') throw new Error(`no text op in draw ${index}`);
        return op.state;
    }

    /** The state of the single `richText` op in the nth recorded draw. */
    richTextState(index = 0): Partial<RichTextState> {
        const op = this.drawn[index]?.ops().find((o) => o.kind === 'richText');
        if (!op || op.kind !== 'richText') throw new Error(`no richText op in draw ${index}`);
        return op.state;
    }

    /** The op kinds of the nth recorded draw, in order. */
    kinds(index = 0): string[] {
        return (this.drawn[index]?.ops() ?? []).map((op) => op.kind);
    }

    measureText(): number { return 0; }
    unmount(): void { }
    execute(callback: () => void): void { callback(); }
    screenshot(): undefined { return undefined; }
    transform(): RenderContext { return this; }
    beginBoolean(): void { }
    endBoolean(): void { }
    beginMask(): void { }
    applyMask(): void { }
    endMask(): void { }
    beginClip(): void { }
    endClip(): void { }
    beginCamera(): void { }
    endCamera(): void { }
}

/** A bare `.text()` op with nothing but content — the shape a custom node draws
 *  when it means "use whatever the document says". */
function bareText(): Graphics {
    return new Graphics().text({ text: 'Hi', width: 100, height: 40 }).fill('white');
}

afterEach(() => setTheme());

describe('text-style defaults on the render context', () => {
    it('fills an inherited family into a text op that names none', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter', fontWeight: 700 });
        ctx.draw(bareText());
        expect(ctx.textState()).toMatchObject({ text: 'Hi', fontFamily: 'Inter', fontWeight: 700 });
    });

    it('leaves a text op that names its own value alone', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter', fontSize: 64 });
        ctx.draw(new Graphics().text({ text: 'Hi', fontFamily: 'Fira Mono' }));
        // The op's own family wins; the size it didn't set is still inherited.
        expect(ctx.textState()).toMatchObject({ fontFamily: 'Fira Mono', fontSize: 64 });
    });

    it('never synthesises a paint op from fill/stroke/shadow defaults', () => {
        // Those are group-scoped ops in a Graphics, not per-shape slots — adding
        // one would change which shapes the group's paint covers.
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fill: 'red', stroke: { weight: 2, fill: 'black' }, shadow: { blur: 4 } });
        ctx.draw(new Graphics().text({ text: 'Hi' }));
        expect(ctx.kinds()).toEqual(['text']);
    });

    it('accumulates per key across nested scopes, inner winning', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter', fontSize: 32 });
        ctx.pushTextStyle({ fontSize: 64 });
        ctx.draw(bareText());
        expect(ctx.textState()).toMatchObject({ fontFamily: 'Inter', fontSize: 64 });
    });

    it('restores the enclosing scope on pop', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter', fontSize: 32 });
        ctx.pushTextStyle({ fontSize: 64 });
        ctx.popTextStyle();
        ctx.draw(bareText());
        expect(ctx.textState()).toMatchObject({ fontFamily: 'Inter', fontSize: 32 });
    });

    it("falls back to the theme's default typography preset with no scope open", () => {
        setTheme({ typography: { default: { fontFamily: 'Inter', fontSize: 48 } } });
        const ctx = new RecorderContext();
        ctx.draw(bareText());
        expect(ctx.textState()).toMatchObject({ fontFamily: 'Inter', fontSize: 48 });
    });

    it('pushTextStyle(null) refuses both the enclosing scope and the theme default', () => {
        setTheme({ typography: { default: { fontFamily: 'Inter' } } });
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontWeight: 700 });
        ctx.pushTextStyle(null);
        ctx.draw(bareText());
        const state = ctx.textState();
        expect(state.fontFamily).toBeUndefined();
        expect(state.fontWeight).toBeUndefined();
    });

    it('hands the very same Graphics through when nothing needs filling in', () => {
        const ctx = new RecorderContext();
        const g = new Graphics().rect({ width: 10, height: 10 }).fill('red');
        ctx.pushTextStyle({ fontFamily: 'Inter' });
        ctx.draw(g);
        expect(ctx.drawn[0]).toBe(g);
    });

    it('leaves the author\'s Graphics untouched when it does rewrite', () => {
        const ctx = new RecorderContext();
        const g = bareText();
        ctx.pushTextStyle({ fontFamily: 'Inter' });
        ctx.draw(g);
        // The submitted instance may be reused for a later pass under a different
        // scope (Text draws one op list for fill, overlay and stroke).
        expect(ctx.drawn[0]).not.toBe(g);
        const original = g.ops().find((op) => op.kind === 'text');
        expect(original && original.kind === 'text' && original.state.fontFamily).toBeUndefined();
    });

    it('carries the group-level modifiers onto the rewritten Graphics', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter' });
        ctx.draw(bareText().opacity(0.4).rotation(30, 'topRight'));
        expect(ctx.drawn[0].groupOpacity()).toBe(0.4);
        expect(ctx.drawn[0].groupTransform()).toMatchObject({ rotation: 30, center: 'topRight' });
    });
});

describe('text-style defaults on a richText op', () => {
    /** A span with only its text set — the rest left for the document to supply. */
    const bareSpan = (text: string) => ({ text }) as unknown as ResolvedTextSpan;

    it('fills the defaults in span by span', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter', fontWeight: 700 });
        ctx.draw(new Graphics().richText({ spans: [bareSpan('a'), bareSpan('b')] }));
        expect(ctx.richTextState().spans).toMatchObject([
            { text: 'a', fontFamily: 'Inter', fontWeight: 700 },
            { text: 'b', fontFamily: 'Inter', fontWeight: 700 },
        ]);
    });

    it('leaves a span that names its own family alone', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontFamily: 'Inter' });
        ctx.draw(new Graphics().richText({
            spans: [{ ...bareSpan('a'), fontFamily: 'Fira Mono' } as ResolvedTextSpan, bareSpan('b')],
        }));
        expect(ctx.richTextState().spans).toMatchObject([
            { fontFamily: 'Fira Mono' },
            { fontFamily: 'Inter' },
        ]);
    });

    it('applies lineHeight/textAlign to the block rather than to each span', () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ lineHeight: 1.8, textAlign: 'left' });
        ctx.draw(new Graphics().richText({ spans: [bareSpan('a')] }));
        expect(ctx.richTextState()).toMatchObject({ lineHeight: 1.8, textAlign: 'left' });
        expect(ctx.richTextState().spans?.[0]).not.toHaveProperty('lineHeight');
    });

    it("skips an inherited 'autofit' size, which a run inside a block can't mean", () => {
        const ctx = new RecorderContext();
        ctx.pushTextStyle({ fontSize: 'autofit', fontFamily: 'Inter' });
        ctx.draw(new Graphics().richText({ spans: [bareSpan('a')] }));
        const span = ctx.richTextState().spans?.[0];
        expect(span).toMatchObject({ fontFamily: 'Inter' });
        expect(span?.fontSize).toBeUndefined();
    });
});

describe('<DefaultTextStyle> over drawn graphics', () => {
    /** A custom node whose whole drawing is one under-specified text op. */
    class RawLabel extends Node {
        protected override renderSelf(ctx: RenderContext): void {
            ctx.draw(bareText());
        }
    }

    function render(root: Node): RecorderContext {
        root.layout({ x: 0, y: 0, width: 200, height: 100 }, scope);
        const ctx = new RecorderContext();
        ctx.execute(() => root.render(ctx));
        return ctx;
    }

    it('reaches a raw Graphics drawn by a descendant', () => {
        const ctx = render(new DefaultTextStyle({
            fontFamily: 'Inter',
            fontWeight: 700,
            children: [new RawLabel({ width: 100, height: 40 })],
        }));
        expect(ctx.textState()).toMatchObject({ fontFamily: 'Inter', fontWeight: 700 });
    });

    it('closes its scope, so a later sibling of the provider is unaffected', () => {
        const sibling = new RawLabel({ width: 100, height: 40 });
        const root = new Node({
            width: 200,
            height: 100,
            children: [
                new DefaultTextStyle({
                    fontFamily: 'Inter',
                    children: [new RawLabel({ width: 100, height: 40 })],
                }),
                sibling,
            ],
        });
        const ctx = render(root);
        expect(ctx.textState(0)).toMatchObject({ fontFamily: 'Inter' });
        expect(ctx.textState(1).fontFamily).toBeUndefined();
    });

    it('agrees with what a Text node under the same provider resolves to', () => {
        const text = new Text({ text: 'Hi' });
        const root = new DefaultTextStyle({
            fontFamily: 'Inter',
            children: [text, new RawLabel({ width: 100, height: 40 })],
        });
        // The node channel binds at assembly; the graphics channel at draw.
        root.bindContext(ContextMap.EMPTY, true);
        const ctx = render(root);
        expect(text.fontFamily).toBe('Inter');
        expect(ctx.textState(0)).toMatchObject({ fontFamily: 'Inter' });
    });
});

describe('asset discovery sees the inherited family', () => {
    class RawLabel extends Node {
        protected override renderSelf(ctx: RenderContext): void {
            ctx.draw(bareText());
        }
    }

    it('registers the font a drawn op inherited, so it actually loads', () => {
        const manifest: AssetManifest = { image: {}, video: {}, audio: {}, font: {} };
        const root = new DefaultTextStyle({
            fontFamily: 'Inter',
            fontWeight: 700,
            children: [new RawLabel({ width: 100, height: 40 })],
        });
        root.layout({ x: 0, y: 0, width: 200, height: 100 }, scope);

        const tracker = new AssetTracker(new AssetCatalog(manifest));
        const ctx = new TrackRenderContext(tracker);
        tracker.start(0);
        ctx.execute(() => root.render(ctx));
        tracker.end();

        expect(tracker.assets.get('Inter')).toMatchObject({
            type: 'font', fontFamily: 'Inter', fontWeight: 700,
        });
    });
});
