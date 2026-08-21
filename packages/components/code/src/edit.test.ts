import { describe, it, expect } from 'vitest';
import { Code } from './node';
import { lines, word } from './code-range';

const SOURCE = 'function add(a, b) {\n  return a + b;\n}';

function make(code = SOURCE): Code {
    return new Code({ code, language: 'typescript' });
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
function drive(command: Iterable<void>, steps: number, dt: number): void {
    const gen = command[Symbol.iterator]() as Generator<void, void, number>;
    gen.next();
    for (let i = 0; i < steps; i++) gen.next(dt);
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
        drive(node.remove(lines(2), 1), 120, 0.01);
        expect(source(node)).toBe('function add(a, b) {\n}');
    });

    it('leaves the row in place for a removal inside a line', () => {
        const node = make();
        drive(node.remove(word(1, 14, 3), 1), 120, 0.01);
        expect(source(node)).toBe('function add(b) {\n  return a + b;\n}');
    });

    it('removes a blank row, which has no characters to resolve a range from', () => {
        const node = make('a\n\nb');
        drive(node.remove(lines(2), 1), 120, 0.01);
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

    it('chains, each step diffing against where the previous one left off', () => {
        const node = make();
        const third = 'function add(a, b) {\n  return a * b;\n}';
        drive(node.to({ code: NEXT }, 1).to({ code: third }, 1), 240, 0.01);
        expect(source(node)).toBe(third);
    });
});
