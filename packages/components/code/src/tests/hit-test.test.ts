import { describe, it, expect } from 'vitest';
import { ContextMap, ManifestAssetCatalog, type Node, type Vector2 } from '@motion-script/core';
import { Code } from '../node';

/**
 * What clicking a listing grabs.
 *
 * A code block is mostly whitespace — a ragged column of lines inside a
 * rectangle as wide as its longest one — so the box a shape is normally grabbed
 * by is, for this node, largely empty space that swallows clicks meant for
 * whatever is behind it. Unpainted, the grab region is the text; painted, it is
 * the box, because then the box is a thing you can see. See `Code.hitTestSelf`.
 *
 * The measurer below is the fixture the geometry is read off: a monospaced
 * 0.6 em advance, so every number in these tests is arithmetic rather than a
 * recorded value.
 */

const CHAR = 0.6;

const scope = {
    measureText: (text: string, fontSize: number) => ({
        width: text.length * fontSize * CHAR,
        height: fontSize,
    }),
};

const FONT_SIZE = 16;
const LINE_HEIGHT = 1.6;
/** Advance of one glyph, and of a whole line, at the fixture's font size. */
const EM = FONT_SIZE * CHAR;
const LINE = FONT_SIZE * LINE_HEIGHT;

/** Two glyphs, a blank line, then ten — a deliberately ragged listing. */
const SOURCE = 'ab\n\nabcdefghij';

function attach<T extends Node>(node: T): T {
    node.attach({
        assets: new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} }),
        context: ContextMap.EMPTY,
        time: 0,
    });
    return node;
}

/**
 * A laid-out block, sized by its own content.
 *
 * Measured explicitly because nothing else does it here: the layout cache a hit
 * test reads is written by `measure`, which in a real tree is the parent's call.
 */
function laidOut(props: Record<string, unknown> = {}): Code {
    const node = attach(
        new Code({ code: SOURCE, language: 'typescript', fontSize: FONT_SIZE, ...props }),
    );
    const size = node.measure({ maxWidth: 600, maxHeight: 400 }, scope as never);
    node.layout({ x: 0, y: 0, width: size.width ?? 0, height: size.height ?? 0 }, scope as never);
    return node;
}

function hits(node: Code, point: Vector2, tolerance = 0): boolean {
    return (node as unknown as {
        _hitTestSelf(p: Vector2, t: number): boolean;
    })._hitTestSelf(point, tolerance);
}

/** The vertical centre of line `i`'s slot, in the node's own y-up space. */
function lineY(node: Code, i: number): number {
    const height = node.layoutBounds.height;
    return height / 2 - i * LINE - LINE / 2;
}

/** The left edge of the code column. */
function startX(node: Code): number {
    return -node.layoutBounds.width / 2;
}

describe('an unpainted listing is grabbed by its text', () => {
    it('hits a short line only across the glyphs it has', () => {
        const node = laidOut();
        const y = lineY(node, 0);
        // Two glyphs in, and one glyph past the end of a two-glyph line.
        expect(hits(node, { x: startX(node) + EM, y })).toBe(true);
        expect(hits(node, { x: startX(node) + EM * 3, y })).toBe(false);
    });

    it('hits the long line right across the block', () => {
        const node = laidOut();
        expect(hits(node, { x: 0, y: lineY(node, 2) })).toBe(true);
    });

    it('falls through a blank line', () => {
        const node = laidOut();
        expect(hits(node, { x: 0, y: lineY(node, 1) })).toBe(false);
    });

    it('still refuses everything outside the block', () => {
        const node = laidOut();
        const outside = node.layoutBounds.width;
        expect(hits(node, { x: outside, y: lineY(node, 2) })).toBe(false);
    });

    it('widens the text by the grab slop it is given', () => {
        const node = laidOut();
        const justPast = { x: startX(node) + EM * 2 + 4, y: lineY(node, 0) };
        expect(hits(node, justPast)).toBe(false);
        expect(hits(node, justPast, 6)).toBe(true);
    });

    it('grabs a blank line by its number once the gutter is showing', () => {
        const node = laidOut({ showLineNumbers: true });
        // Inside the gutter, on the blank line: there is a numeral drawn there.
        expect(hits(node, { x: startX(node) + 1, y: lineY(node, 1) })).toBe(true);
        expect(hits(node, { x: 0, y: lineY(node, 1) })).toBe(false);
    });
});

describe('a painted listing is grabbed by its box', () => {
    it.each([
        ['a fill', { fill: '#101010' }],
        ['a stroke', { stroke: { weight: 2, fill: '#101010' } }],
        ['a shadow', { shadow: { blur: 8, fill: '#000000' } }],
        ['an overlay', { overlay: '#ffffff20' }],
    ])('takes the whole rectangle with %s', (_name, props) => {
        const node = laidOut(props);
        // The point past the end of the two-glyph line, which the unpainted
        // block above lets through.
        expect(hits(node, { x: 0, y: lineY(node, 0) })).toBe(true);
    });
});
