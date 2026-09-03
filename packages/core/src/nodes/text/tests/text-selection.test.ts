import { describe, it, expect } from 'vitest';
import { Text } from '@/nodes/text/text-node';
import { normalizeRanges, TextSelection } from '@/nodes/text/text-selection';
import { isStyleOnlySegment, TextSegment } from '@/render/descriptors/text';

const ranges = (sel: TextSelection) => sel.ranges.map(r => [r.start, r.end]);

// Read the private segment builder for overlap-rule assertions.
const buildSegments = (t: Text): TextSegment[] | null => (t as any)._buildSegments();

describe('Text selectors – range computation', () => {
    it('find selects the first occurrence by default', () => {
        const t = new Text({ text: 'a cat and a cat' });
        expect(ranges(t.find('cat'))).toEqual([[2, 5]]);
    });

    it('find with index selects the nth occurrence', () => {
        const t = new Text({ text: 'a cat and a cat' });
        expect(ranges(t.find('cat', { index: 1 }))).toEqual([[12, 15]]);
    });

    it('find returns an empty selection when text is absent or index out of range', () => {
        const t = new Text({ text: 'hello' });
        expect(ranges(t.find('xyz'))).toEqual([]);
        expect(ranges(t.find('hello', { index: 3 }))).toEqual([]);
    });

    it('match selects every match of a (non-global) regex', () => {
        const t = new Text({ text: 'a1 b2 c3' });
        expect(ranges(t.match(/\d/))).toEqual([[1, 2], [4, 5], [7, 8]]);
    });

    it('line selects the nth newline-delimited line, excluding the newline', () => {
        const t = new Text({ text: 'one\ntwo\nthree' });
        expect(ranges(t.line(0))).toEqual([[0, 3]]);
        expect(ranges(t.line(1))).toEqual([[4, 7]]);
        expect(ranges(t.line(2))).toEqual([[8, 13]]);
        expect(ranges(t.line(5))).toEqual([]);
    });

    it('words selects every whitespace-delimited word', () => {
        const t = new Text({ text: 'the  quick brown' });
        expect(ranges(t.words())).toEqual([[0, 3], [5, 10], [11, 16]]);
    });

    it('word selects the nth word', () => {
        const t = new Text({ text: 'the quick brown' });
        expect(ranges(t.word(1))).toEqual([[4, 9]]);
        expect(ranges(t.word(9))).toEqual([]);
    });

    it('slice selects a raw range and clamps out-of-bounds', () => {
        const t = new Text({ text: 'hello' });
        expect(ranges(t.slice(1, 3))).toEqual([[1, 3]]);
        expect(ranges(t.slice(3, 99))).toEqual([[3, 5]]);
        expect(ranges(t.slice(4, 2))).toEqual([]); // inverted → empty
    });

    it('filter coalesces adjacent matching characters into runs', () => {
        const t = new Text({ text: 'a11b222' });
        const sel = t.filter(c => /\d/.test(c));
        expect(ranges(sel)).toEqual([[1, 3], [4, 7]]);
    });
});

describe('normalizeRanges', () => {
    it('clamps, drops empties, sorts, and merges overlapping/touching ranges', () => {
        const out = normalizeRanges(
            [{ start: 5, end: 8 }, { start: 0, end: 2 }, { start: 2, end: 4 }, { start: 7, end: 20 }, { start: 3, end: 3 }],
            10,
        );
        // [0,2)+[2,4) touch → [0,4); [5,8)+[7,20→10) overlap → [5,10); empty dropped.
        expect(out.map(r => [r.start, r.end])).toEqual([[0, 4], [5, 10]]);
    });
});

describe('TextSelection._prepareStep – interpolation', () => {
    const drive = (sel: TextSelection, props: any, duration: number, dt: number) => {
        const step = sel._prepareStep(props, duration);
        step.seek(0);
        let done = false;
        while (!done) done = step.advance(dt);
    };

    it('interpolates numeric overrides (opacity, transform, font)', () => {
        const t = new Text({ text: 'hello', fontWeight: 400, letterSpacing: 0 });
        const sel = t.find('hello');
        const step = sel._prepareStep({ opacity: 0, y: -20, scale: 2, fontWeight: 700 }, 1);
        step.seek(0.5); // half-way
        expect(sel.overrides.opacity).toBeCloseTo(0.5);
        expect(sel.overrides.y).toBeCloseTo(-10);
        expect(sel.overrides.scale).toBeCloseTo(1.5);
        expect(sel.overrides.fontWeight).toBeCloseTo(550);

        drive(sel, { opacity: 0, y: -20 }, 1, 0.25);
        expect(sel.overrides.opacity).toBe(0);
        expect(sel.overrides.y).toBe(-20);
    });

    it('resolves and lerps a fill override', () => {
        const t = new Text({ text: 'hello', fill: '#000000' });
        const sel = t.find('hello');
        drive(sel, { fill: '#ffffff' }, 1, 0.25);
        expect(sel.overrides.fill).not.toBeNull();
        expect(sel.overrides.fill!.length).toBeGreaterThan(0);
    });
});

describe('Text._buildSegments – overlap rule', () => {
    it('returns null when no active (non-identity) selections exist', () => {
        const t = new Text({ text: 'hello' });
        expect(buildSegments(t)).toBeNull();
        // A selection with no tween applied is identity → still null.
        t.find('hello');
        expect(buildSegments(t)).toBeNull();
    });

    it('splits at boundaries and applies overrides only to covered pieces', () => {
        const t = new Text({ text: 'hello world' });
        const sel = t.find('world'); // [6,11)
        sel.overrides.opacity = 0.5;

        const segs = buildSegments(t)!;
        // Pieces: "hello " (untouched) and "world" (opacity 0.5).
        const world = segs.find(s => s.text === 'world')!;
        const hello = segs.find(s => s.text === 'hello ')!;
        expect(world.opacity).toBe(0.5);
        expect(hello.opacity).toBe(1);
    });

    it('multiplies opacity and lets the later selection win on transforms for overlapping glyphs', () => {
        const t = new Text({ text: 'abcdef' });
        const a = t.find('abcd'); // [0,4) — created first
        const b = t.find('cdef'); // [2,6) — created second, overlaps [2,4)
        a.overrides.opacity = 0.5;
        a.overrides.y = 10;
        b.overrides.opacity = 0.5;
        b.overrides.y = -10;

        const segs = buildSegments(t)!;
        const overlap = segs.find(s => s.text === 'cd')!;
        // opacity multiplies: 0.5 * 0.5
        expect(overlap.opacity).toBeCloseTo(0.25);
        // later selection (b) wins on transform
        expect(overlap.y).toBe(-10);
    });
});

describe('Text._buildSegments – Write On reveal (start/end)', () => {
    it('stays on the null fast path at the untouched defaults', () => {
        const t = new Text({ text: 'abcdefghij' });
        expect(buildSegments(t)).toBeNull();
        const explicit = new Text({ text: 'abcdefghij', start: 0, end: 1 });
        expect(buildSegments(explicit)).toBeNull();
    });

    it('reveals whole characters left-to-right as `end` sweeps up — no fade', () => {
        const t = new Text({ text: 'abcdefghij', end: 0.5 }); // revealEnd = round(5) = 5
        const segs = buildSegments(t)!;
        const opacityOf = (s: string) => segs.find(seg => seg.text === s)!.opacity;

        expect(opacityOf('abcde')).toBe(1);
        expect(opacityOf('fghij')).toBe(0);
    });

    it('erases whole characters from the front as `begin` sweeps up — no fade', () => {
        const t = new Text({ text: 'abcdefghij', start: 0.5 }); // revealStart = round(5) = 5
        const segs = buildSegments(t)!;
        const opacityOf = (s: string) => segs.find(seg => seg.text === s)!.opacity;

        expect(opacityOf('abcde')).toBe(0);
        expect(opacityOf('fghij')).toBe(1);
    });

    it('composes with an active selection by multiplying opacity, not overriding it', () => {
        const t = new Text({ text: 'hello world', end: 0.5 }); // revealEnd = round(5.5) = 6
        const sel = t.find('hello'); // [0,5)
        sel.overrides.opacity = 0.5;

        const segs = buildSegments(t)!;
        const opacityOf = (s: string) => segs.find(seg => seg.text === s)!.opacity;

        expect(opacityOf('hello')).toBeCloseTo(0.5); // selection only, fully inside reveal
        expect(opacityOf(' ')).toBe(1); // no selection, fully inside reveal
        expect(opacityOf('world')).toBe(0); // outside the reveal window
    });
});


describe('TextSelection.set - per-run style, no tween', () => {
    it('overrides the face, size and slant a run is shaped in', () => {
        const t = new Text({
            text: 'hello world',
            fontFamily: 'Inter',
            fontSize: 24,
            fontStyle: 'normal',
        });
        t.find('world').set({ fontFamily: 'Georgia', fontSize: 48, fontStyle: 'italic' });

        const segs = buildSegments(t)!;
        const world = segs.find(s => s.text === 'world')!;
        const hello = segs.find(s => s.text === 'hello ')!;

        expect(world.fontFamily).toBe('Georgia');
        expect(world.fontSize).toBe(48);
        expect(world.fontStyle).toBe('italic');
        // The neighbours state the node's own style rather than leaving it
        // unset - see the note on TextSegment.
        expect(hello.fontFamily).toBe('Inter');
        expect(hello.fontSize).toBe(24);
        expect(hello.fontStyle).toBe('normal');
    });

    it('resolves a fill the way a tween to the same value would', () => {
        const t = new Text({ text: 'hello', fill: '#000000' });
        const sel = t.find('hello').set({ fill: '#ff0000' });
        expect(sel.overrides.fill).not.toBeNull();
        expect(sel.overrides.fill!.length).toBeGreaterThan(0);
    });

    it('leaves an untouched selection identity, so the fast path survives it', () => {
        const t = new Text({ text: 'hello', fontFamily: 'Inter', fontSize: 24 });
        const sel = t.find('hello');
        expect(sel.isIdentity).toBe(true);
        // Re-stating the node's own values is still identity: what makes a
        // selection active is differing from the node, not having been written.
        sel.set({ fontFamily: 'Inter', fontSize: 24 });
        expect(sel.isIdentity).toBe(true);
        expect(buildSegments(t)).toBeNull();

        sel.set({ fontFamily: 'Georgia' });
        expect(sel.isIdentity).toBe(false);
    });

    it('switches a face at the end of a tween rather than part-way through it', () => {
        const t = new Text({ text: 'hello', fontFamily: 'Inter' });
        const sel = t.find('hello');
        const step = sel._prepareStep({ fontFamily: 'Georgia' }, 1);
        step.seek(0.5);
        expect(sel.overrides.fontFamily).toBe('Inter');
        step.seek(1);
        expect(sel.overrides.fontFamily).toBe('Georgia');
    });
});

describe('isStyleOnlySegment', () => {
    it('is true for a run that is only styled, and false once it is moved', () => {
        const t = new Text({ text: 'hello world', fontFamily: 'Inter' });
        t.find('world').set({ fontWeight: 700 });
        expect(buildSegments(t)!.every(isStyleOnlySegment)).toBe(true);

        const moved = new Text({ text: 'hello world', fontFamily: 'Inter' });
        moved.find('world').set({ y: -10 });
        expect(moved.find('world') && buildSegments(moved)!.every(isStyleOnlySegment)).toBe(false);
    });
});

describe('Text.runs — styling as a property', () => {
    it('styles a stretch with no selection in sight', () => {
        const t = new Text({
            text: 'hello world',
            fontFamily: 'Inter',
            fontWeight: 400,
            runs: [{ start: 6, end: 11, fontWeight: 700, fontFamily: 'Georgia' }],
        });
        const segs = buildSegments(t)!;
        expect(segs.map(s => [s.text, s.fontWeight, s.fontFamily])).toEqual([
            ['hello ', 400, 'Inter'],
            ['world', 700, 'Georgia'],
        ]);
    });

    it('keeps the single-run fast path when there are none', () => {
        expect(buildSegments(new Text({ text: 'hello', runs: [] }))).toBeNull();
    });

    it('clamps a run to the string the node currently holds', () => {
        const t = new Text({
            text: 'hi',
            fontWeight: 400,
            runs: [{ start: 1, end: 99, fontWeight: 700 }],
        });
        expect(buildSegments(t)!.map(s => [s.text, s.fontWeight])).toEqual([
            ['h', 400],
            ['i', 700],
        ]);
    });

    it('lets a selection animate a run rather than being overruled by it', () => {
        // The precedence that matters: fading a word that happens to be bold has
        // to leave it bold *and* faded, with the selection deciding.
        const t = new Text({
            text: 'hello world',
            fontWeight: 400,
            runs: [{ start: 6, end: 11, fontWeight: 700 }],
        });
        t.find('world').set({ fontWeight: 900, opacity: 0.5 });
        const world = buildSegments(t)!.find(s => s.text === 'world')!;
        expect(world.fontWeight).toBe(900);
        expect(world.opacity).toBe(0.5);
    });

    it("resolves a run's paint the way the node's own is resolved", () => {
        const t = new Text({
            text: 'hello',
            fill: '#000000',
            runs: [{ start: 0, end: 5, fill: '#ff0000' }],
        });
        const seg = buildSegments(t)![0];
        expect(seg.fill?.length).toBeGreaterThan(0);
    });
});
