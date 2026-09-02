import { describe, it, expect } from 'vitest';
import type { Command } from '@motion-script/core';
import { commandSequence, ContextMap, ManifestAssetCatalog, type Node } from '@motion-script/core';
import { Code } from '../node';
import { lines, word } from '../code-range';

/**
 * Put `node` in a live tree.
 *
 * Measuring, drawing and animating are all gated on a node being attached, so a
 * unit test has to say so explicitly — the runtime does this once per frame for
 * the whole scene.
 */
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

/** The listing's current source, which is the settled token structure joined. */
function source(node: Code): string {
    return (node as unknown as { joinedSource(): string }).joinedSource();
}

/** How many transitions the node currently has in flight. */
function inFlight(node: Code): number {
    return (node as unknown as { transitions: unknown[] }).transitions.length;
}

/**
 * Run a command as a generator, which is still how a sequential scene drives
 * one — `Command` is iterable precisely so `yield*` keeps working.
 */
function drive(command: Command<never>, steps: number, dt: number): void {
    const step = command._stepper();
    step.seek(0);
    for (let i = 0; i < steps; i++) step.advance(dt);
}

describe('editing commands', () => {
    it('appends to the end of the source', () => {
        const node = make();
        drive(node.append('\nadd(1, 2);', 1), 120, 0.01);
        expect(source(node)).toBe(`${SOURCE}\nadd(1, 2);`);
    });

    it('prepends above the source', () => {
        const node = make();
        drive(node.prepend('"use strict";\n', 1), 120, 0.01);
        expect(source(node)).toBe(`"use strict";\n${SOURCE}`);
    });

    it('inserts at a (line, col)', () => {
        const node = make();
        drive(node.insert([1, 14], 'x, ', 1), 120, 0.01);
        expect(source(node)).toBe('function add(x, a, b) {\n  return a + b;\n}');
    });

    it('takes the line break with a whole-line removal', () => {
        const node = make();
        drive(node.erase(lines(2), 1), 120, 0.01);
        expect(source(node)).toBe('function add(a, b) {\n}');
    });

    it('leaves the row in place for a removal inside a line', () => {
        const node = make();
        drive(node.erase(word(1, 14, 3), 1), 120, 0.01);
        expect(source(node)).toBe('function add(b) {\n  return a + b;\n}');
    });

    it('removes a blank row, which has no characters to resolve a range from', () => {
        const node = make('a\n\nb');
        drive(node.erase(lines(2), 1), 120, 0.01);
        expect(source(node)).toBe('a\nb');
    });

    it('replaces a blank row with real content', () => {
        const node = make('a\n\nb');
        drive(node.replace(lines(2), 'middle', 1), 120, 0.01);
        expect(source(node)).toBe('a\nmiddle\nb');
    });

    it('replaces one row with several, as rows rather than as newline glyphs', () => {
        const node = make('a\nb');
        drive(node.replace(lines(2), 'x\ny\nz', 1), 120, 0.01);
        expect(source(node)).toBe('a\nx\ny\nz');
    });

    it('replaces a line with new content', () => {
        const node = make();
        drive(node.replace(lines(2), '  return b + a;', 1), 120, 0.01);
        expect(source(node)).toBe('function add(a, b) {\n  return b + a;\n}');
    });

    it('leaves nothing in flight once an edit lands', () => {
        const node = make();
        drive(node.append('\n// done', 1), 120, 0.01);
        expect(inFlight(node)).toBe(0);
    });
});

describe('to({ code })', () => {
    const NEXT = 'function add(a, b) {\n  return a - b;\n}';

    it('animates rather than snapping, and settles on the target', () => {
        const node = make();
        const chain = node.to({ code: NEXT }, 1);
        const stepper = chain._stepper();

        stepper.seek(0);
        expect(source(node)).toBe(SOURCE);
        expect(inFlight(node)).toBe(0);

        stepper.seek(0.5);
        // Mid-flight the listing already holds the target structure — the frame
        // is drawn by interpolating between the two, not by holding the old one.
        expect(source(node)).toBe(NEXT);
        expect(inFlight(node)).toBe(1);

        stepper.seek(1);
        expect(source(node)).toBe(NEXT);
        expect(inFlight(node)).toBe(0);
    });

    it('scrubs backwards to the listing that preceded it', () => {
        const node = make();
        const stepper = node.to({ code: NEXT }, 1)._stepper();
        stepper.seek(1);
        stepper.seek(0);
        expect(source(node)).toBe(SOURCE);
        expect(inFlight(node)).toBe(0);
    });

    it('writes the code prop through, so a later edit diffs against it', () => {
        const node = make();
        drive(node.to({ code: NEXT }, 1), 120, 0.01);
        expect(node.code).toBe(NEXT);
    });

    it('tweens sibling props in the same step', () => {
        const node = make();
        drive(node.to({ code: NEXT, fontSize: 40 }, 1), 120, 0.01);
        expect(node.fontSize).toBe(40);
        expect(source(node)).toBe(NEXT);
    });

    it('falls through to the ordinary tween when code is unchanged', () => {
        const node = make();
        drive(node.to({ code: SOURCE, opacity: 0.5 }, 1), 120, 0.01);
        expect(node.opacity).toBeCloseTo(0.5);
        expect(inFlight(node)).toBe(0);
    });

    it('sequences, each step diffing against where the previous one left off', () => {
        const node = make();
        const third = 'function add(a, b) {\n  return a * b;\n}';
        // `commandSequence` rather than the old `sequence`: a command is a value
        // with a declared duration, so running one after another is composition
        // rather than control flow. `to()` still prepares lazily, so the second
        // step's `from` is read when it first runs — which is the whole point of
        // this test.
        drive(
            commandSequence(node, node.to({ code: NEXT }, 1), node.to({ code: third }, 1)) as Command<never>,
            240,
            0.01,
        );
        expect(source(node)).toBe(third);
    });
});

describe('one edit carries every change in it', () => {
    // A caller that splits a multi-part change across several commands and runs
    // them together loses all but one: each command resolves and writes back the
    // *whole* listing, so two built from the same starting point are rival copies
    // of the document rather than patches, and the last one driven wins.
    // Everything a step changes therefore has to travel as one edit, and this is
    // the contract that makes that possible.
    it('changes a line and splices another in the same step', () => {
        const node = make();
        const next = 'function add(a, b) {\n  // sum\n  return a + b + 1;\n}';
        drive(node.to({ code: next }, 1), 120, 0.01);
        expect(source(node)).toBe(next);
    });

    it('rewrites several separated lines at once', () => {
        const node = make('let a = 1;\nlet b = 2;\nlet c = 3;\nlet d = 4;');
        const next = 'let a = 9;\nlet b = 2;\nlet c = 8;\nlet d = 4;';
        drive(node.to({ code: next }, 1), 120, 0.01);
        expect(source(node)).toBe(next);
    });
});
