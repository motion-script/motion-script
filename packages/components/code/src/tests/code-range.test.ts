import { describe, it, expect } from 'vitest';
import type { Command } from '@motion-script/core';
import { ContextMap, ManifestAssetCatalog, type Node } from '@motion-script/core';
import { Code } from '../node';
import { lines, word, CodeRanges, CodeRangeChain } from '../code-range';

function attach<T extends Node>(node: T): T {
    node.attach({
        assets: new ManifestAssetCatalog({ image: {}, video: {}, audio: {}, font: {} }),
        context: ContextMap.EMPTY,
        time: 0,
    });
    return node;
}

const SOURCE = 'function add(a, b) {\n  return a + b;\n}';

function make(code = SOURCE): Code {
    return attach(new Code({ code, language: 'typescript' }));
}

function drive(command: Command<never>, steps: number, dt: number): void {
    const step = command._stepper();
    step.seek(0);
    for (let i = 0; i < steps; i++) step.advance(dt);
}

/** Number of tokens `highlight()` currently considers "in range" (opacity 1). */
function highlightedTokenCount(node: Code): number {
    return (node as unknown as { highlightedIds: Set<number> }).highlightedIds.size;
}

describe('CodeRangeChain', () => {
    it('starts empty', () => {
        expect([...new CodeRangeChain()]).toEqual([]);
    });

    it('accumulates ranges in call order', () => {
        const chain = CodeRanges.lines(2).word(5, 1, 3);
        expect(chain.list).toEqual([lines(2), word(5, 1, 3)]);
    });

    it('accumulates same-kind calls too', () => {
        const chain = CodeRanges.lines(2).lines(9);
        expect(chain.list).toEqual([lines(2), lines(9)]);
    });

    it('is iterable and spreadable', () => {
        const chain = CodeRanges.lines(2).word(5, 1, 3);
        expect([...chain]).toEqual([lines(2), word(5, 1, 3)]);
    });

    it('does not mutate a prior chain when extended — each call returns a new one', () => {
        const first = CodeRanges.lines(2);
        const second = first.word(5, 1, 3);
        expect(first.list).toEqual([lines(2)]);
        expect(second.list).toEqual([lines(2), word(5, 1, 3)]);
        expect(first).not.toBe(second);
    });

    it('leaves the shared CodeRanges entry point empty across uses', () => {
        CodeRanges.lines(2); // built and discarded
        CodeRanges.word(1, 1, 1);
        expect(CodeRanges.list).toEqual([]);
    });
});

describe('Code.highlight() with a multi-range selection', () => {
    it('highlights the union of every range in a CodeRanges chain', () => {
        const singleLine = make();
        drive(singleLine.highlight(lines(1), 1), 120, 0.01);
        const singleLineCount = highlightedTokenCount(singleLine);
        expect(singleLineCount).toBeGreaterThan(0);

        const twoLines = make();
        drive(twoLines.highlight(CodeRanges.lines(1).lines(3), 1), 120, 0.01);
        const twoLineCount = highlightedTokenCount(twoLines);

        // Line 3 ("}") contributes at least one more token, so the union must
        // be strictly larger than either range alone — proves both ranges
        // were actually resolved, not just the first/last one.
        expect(twoLineCount).toBeGreaterThan(singleLineCount);
    });

    it('also accepts a plain array of ranges, not just a CodeRangeChain', () => {
        const node = make();
        drive(node.highlight([lines(1), lines(3)], 1), 120, 0.01);
        expect(highlightedTokenCount(node)).toBeGreaterThan(0);
    });
});
