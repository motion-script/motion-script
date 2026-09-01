import { describe, it, expect, beforeAll } from 'vitest';
import {
    CanvasRenderContext2D, ContextMap, Graphics2D, ManifestAssetCatalog,
    type Node, type RenderContext2D, type Size2D, type TextState,
} from '@motion-script/core';
import { Code } from '../node';
import { lines } from '../code-range';
import { ensureHighlighter } from '../highlight';

/** `render.ts`'s gutter colour, restated — it is not exported. */
const LINE_NUMBER_COLOR = [0.45, 0.5, 0.55, 1];

/**
 * How a wholly new row arrives.
 *
 * Every one of these used to slide: a row appended below the listing rose from
 * off the bottom, one prepended above it descended, and one spliced between two
 * rows that were already there came in from the left. Each was a claim about
 * where the line had come from, and a listing has no such story to tell — text
 * is written where it belongs rather than travelling there — so the only
 * entrance left is the fade. What that means concretely, and what these tests
 * pin, is that the row is drawn at exactly one place for the whole of its
 * entrance.
 */

/** The grammar streams in at runtime; without it every row is one flat token. */
beforeAll(async () => {
    await ensureHighlighter(undefined, ['typescript']);
});

/**
 * Records where each text op lands, so a test can ask whether something moved.
 *
 * `transform()` returning `this` is what makes that answerable: the node's own
 * transforms are flattened away, so the (x, y) on a recorded op is the one the
 * renderer computed rather than one composed with a stack this test would then
 * have to unwind.
 */
class DrawRecorder extends CanvasRenderContext2D {
    readonly texts: Array<{ text: string; x: number; y: number; opacity: number; gutter: boolean }> = [];

    protected drawGraphics(graphics: Graphics2D): void {
        // A drawn glyph is two ops — the `text` that places it and the `fill`
        // that paints it — so the opacity is carried by the op *after* the one
        // that says what was drawn.
        let pending: { text: string; x: number; y: number; opacity: number; gutter: boolean } | null = null;
        for (const op of graphics.ops()) {
            if (op.kind === 'text') {
                const state = op.state as Partial<TextState>;
                pending = {
                    text: String(state.text ?? ''),
                    x: Number(state.x ?? 0),
                    y: Number(state.y ?? 0),
                    opacity: 1,
                    gutter: false,
                };
                this.texts.push(pending);
            } else if (op.kind === 'fill' && pending) {
                const paints = op.fills as Array<{ opacity?: number; color?: number[] }>;
                pending.opacity = Number(paints[0]?.opacity ?? 1);
                // A line number is the one thing drawn in the gutter colour, so
                // that is how a test tells "3" the row label from "3" the digit
                // someone wrote in their code.
                pending.gutter = String(paints[0]?.color) === String(LINE_NUMBER_COLOR);
                pending = null;
            }
        }
    }

    /** Every distinct place a token whose content is `text` was drawn. */
    placesOf(text: string): Set<string> {
        const places = new Set<string>();
        for (const t of this.texts) {
            if (t.text === text) places.add(`${t.x.toFixed(4)},${t.y.toFixed(4)}`);
        }
        return places;
    }

    measureText(text: string, fontSize: number): Size2D {
        return { width: text.length * fontSize * 0.6, height: fontSize };
    }
    unmount(): void { }
    execute(callback: () => void): void { callback(); }
    screenshot(): undefined { return undefined; }
    transform(): RenderContext2D { return this; }
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

const SOURCE = 'function add(a, b) {\n  return a + b;\n}';

function make(code = SOURCE): Code {
    const node = new Code({ code, language: 'typescript' });
    node.attach({
        assets: new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} }),
        context: ContextMap.EMPTY,
        time: 0,
    });
    return node;
}

/**
 * Every distinct place a token is drawn at over the course of `command`.
 *
 * The sampling is the point: a row that *travels* into place occupies a
 * different spot on every frame of its entrance, so a token drawn at exactly one
 * place across the whole edit is a token that only ever faded. The node is laid
 * out once, before the edit, so the block growing under it cannot be mistaken
 * for the row moving.
 */
function drawnPlaces(node: Code, command: Iterable<void>, text: string): Set<string> {
    const ctx = new DrawRecorder();
    node.layout({ x: 0, y: 0, width: 800, height: 600 }, ctx);
    const gen = command[Symbol.iterator]() as Generator<void, void, number>;
    gen.next();
    for (let i = 0; i < 40; i++) {
        gen.next(0.025);
        ctx.execute(() => node.render(ctx));
    }
    return ctx.placesOf(text);
}

/** Ids of the rows the in-flight edit is bringing in whole. */
function enteringRows(node: Code): number {
    const transitions = (node as unknown as {
        transitions: Array<{ kind: string; enteringLineIds?: Set<number> }>;
    }).transitions;
    return transitions.find(t => t.kind === 'structural')?.enteringLineIds?.size ?? 0;
}

function drive(command: Iterable<void>, steps: number, dt: number): void {
    const gen = command[Symbol.iterator]() as Generator<void, void, number>;
    gen.next();
    for (let i = 0; i < steps; i++) gen.next(dt);
}

describe('a wholly new row fades in where it lands', () => {
    it('does not travel when it is appended below everything', () => {
        const node = make();
        expect(drawnPlaces(node, node.append('\nlog', 1), 'log').size).toBe(1);
    });

    it('does not travel when it is prepended above everything', () => {
        const node = make();
        expect(drawnPlaces(node, node.prepend('log\n', 1), 'log').size).toBe(1);
    });

    it('does not travel when it is spliced between rows that were already there', () => {
        const node = make();
        expect(drawnPlaces(node, node.insert([2, 1], 'log\n', 1), 'log').size).toBe(1);
    });
});

describe('what counts as a wholly new row', () => {
    it('counts each new row once, however many tokens it holds', () => {
        const node = make();
        drive(node.append('\nadd(1, 2);\nadd(3, 4);', 1), 20, 0.01);
        expect(enteringRows(node)).toBe(2);
    });

    it('counts none when the edit only splices tokens into a row that existed', () => {
        const node = make();
        drive(node.to({ code: 'function add(a, b) {\n  return a + b + 1;\n}' }, 1), 20, 0.01);
        expect(enteringRows(node)).toBe(0);
    });
});

describe('the gutter numbers slots, not rows', () => {
    /** Every opacity the number `label` was drawn at across the edit. */
    function numberOpacities(node: Code, command: Iterable<void>, label: string): number[] {
        const ctx = new DrawRecorder();
        node.layout({ x: 0, y: 0, width: 800, height: 600 }, ctx);
        const gen = command[Symbol.iterator]() as Generator<void, void, number>;
        gen.next();
        const seen: number[] = [];
        for (let i = 0; i < 40; i++) {
            gen.next(0.025);
            ctx.texts.length = 0;
            ctx.execute(() => node.render(ctx));
            for (const t of ctx.texts) if (t.gutter && t.text === label) seen.push(t.opacity);
        }
        return seen;
    }

    const NUMBERED = 'const a = 1;\nconst b = 2;\nconst c = 3;';

    function numbered(code = NUMBERED): Code {
        const node = new Code({ code, language: 'typescript', showLineNumbers: true });
        node.attach({
            assets: new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} }),
            context: ContextMap.EMPTY,
            time: 0,
        });
        return node;
    }

    it('holds a number solid through a rewrite of the line it labels', () => {
        // Rewritten past anything the diff can pair, so line 2 is torn down and
        // rebuilt. The row may do that; the number 2 must not, because the
        // listing has a second line before the edit and after it.
        const node = numbered();
        const next = 'const a = 1;\nlet somethingEntirelyElse = fetch(url);\nconst c = 3;';
        const drawn = numberOpacities(node, node.to({ code: next }, 1), '2');
        expect(drawn.length).toBeGreaterThan(0);
        expect(Math.min(...drawn)).toBe(1);
    });

    it('fades in only the number the block grew to reach', () => {
        const node = numbered();
        const drawn = numberOpacities(node, node.append('\nconst d = 4;', 1), '4');
        expect(Math.min(...drawn)).toBeLessThan(1);
        expect(Math.max(...drawn)).toBe(1);
    });

    it('keeps the earlier numbers solid while a line is spliced into the middle', () => {
        // Inserting at line 2 renumbers nothing before it, and the block having
        // grown is the *last* number's news, not the middle's.
        const node = numbered();
        const drawn = numberOpacities(node, node.insert([2, 1], 'const x = 0;\n', 1), '2');
        expect(Math.min(...drawn)).toBe(1);
    });

    it('fades out only the number the block shrank past', () => {
        const node = numbered();
        const drawn = numberOpacities(node, node.erase(lines(3, 3), 1), '3');
        expect(Math.min(...drawn)).toBeLessThan(1);
    });
});
