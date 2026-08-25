import { describe, it, expect } from 'vitest';
import { Text } from '@/nodes/text/text-node';
import { normalizeRanges, TextSelection } from '@/nodes/text/text-selection';
import { TextSegment } from '@/render/descriptors/text';

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
