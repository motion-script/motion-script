import { describe, it, expect } from 'vitest';
import { parseCSV, parseData } from '@/util/csv';

describe('parseCSV', () => {
    it('parses a simple header + rows into records', () => {
        const csv = 'matchup,alice,bob\nCity Engine,2.3,2.5\nRoad Engine,3.2,1.9\n';
        expect(parseCSV(csv)).toEqual([
            { matchup: 'City Engine', alice: 2.3, bob: 2.5 },
            { matchup: 'Road Engine', alice: 3.2, bob: 1.9 },
        ]);
    });

    it('auto-detects numeric columns per-column, leaving text columns as strings', () => {
        const csv = 'name,score\nAda,10\nGrace,20\n';
        const rows = parseCSV(csv);
        expect(rows[0].score).toBe(10);
        expect(typeof rows[0].score).toBe('number');
        expect(rows[0].name).toBe('Ada');
    });

    it('does not coerce a column containing any non-numeric cell', () => {
        const csv = 'code\n007\nN/A\n';
        expect(parseCSV(csv)).toEqual([{ code: '007' }, { code: 'N/A' }]);
    });

    it('handles quoted fields with embedded commas and newlines', () => {
        const csv = 'name,note\n"Doe, John","line one\nline two"\n';
        expect(parseCSV(csv)).toEqual([
            { name: 'Doe, John', note: 'line one\nline two' },
        ]);
    });

    it('unescapes doubled quotes inside quoted fields', () => {
        const csv = 'quote\n"She said ""hi"""\n';
        expect(parseCSV(csv)).toEqual([{ quote: 'She said "hi"' }]);
    });

    it('handles CRLF line endings', () => {
        const csv = 'a,b\r\n1,2\r\n3,4\r\n';
        expect(parseCSV(csv)).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    });

    it('works without a trailing newline on the last row', () => {
        const csv = 'a,b\n1,2';
        expect(parseCSV(csv)).toEqual([{ a: 1, b: 2 }]);
    });

    it('trims header whitespace but preserves it in data cells', () => {
        const csv = ' a , b \nx, y \n';
        expect(parseCSV(csv, { numeric: false })).toEqual([{ a: 'x', b: ' y ' }]);
    });

    it('respects an explicit numeric column list', () => {
        const csv = 'id,value\n01,5\n02,7\n';
        expect(parseCSV(csv, { numeric: ['value'] })).toEqual([
            { id: '01', value: 5 },
            { id: '02', value: 7 },
        ]);
    });

    it('disables all coercion when numeric is false', () => {
        const csv = 'a,b\n1,2\n';
        expect(parseCSV(csv, { numeric: false })).toEqual([{ a: '1', b: '2' }]);
    });

    it('supports a custom delimiter', () => {
        const csv = 'a;b\n1;2\n';
        expect(parseCSV(csv, { delimiter: ';' })).toEqual([{ a: 1, b: 2 }]);
    });

    it('returns an empty array for empty input', () => {
        expect(parseCSV('')).toEqual([]);
    });

    it('returns an empty array for a header-only file', () => {
        expect(parseCSV('a,b\n')).toEqual([]);
    });

    it('auto-detects boolean columns per-column, leaving text columns as strings', () => {
        const csv = 'name,active\nAda,true\nGrace,false\n';
        expect(parseCSV(csv)).toEqual([
            { name: 'Ada', active: true },
            { name: 'Grace', active: false },
        ]);
    });

    it('does not coerce a column containing any non-boolean cell', () => {
        const csv = 'flag\ntrue\nmaybe\n';
        expect(parseCSV(csv)).toEqual([{ flag: 'true' }, { flag: 'maybe' }]);
    });

    it('respects an explicit boolean column list', () => {
        const csv = 'id,ok\nrow-1,true\nrow-2,false\n';
        expect(parseCSV(csv, { boolean: ['ok'] })).toEqual([
            { id: 'row-1', ok: true },
            { id: 'row-2', ok: false },
        ]);
    });

    it('disables all boolean coercion when boolean is false', () => {
        const csv = 'flag\ntrue\nfalse\n';
        expect(parseCSV(csv, { boolean: false })).toEqual([{ flag: 'true' }, { flag: 'false' }]);
    });

    it('never coerces a column to boolean once it has coerced to numeric', () => {
        // "0"/"1" are valid numbers, not "true"/"false" strings, so this column
        // stays numeric — this test just guards the numeric pass keeps priority.
        const csv = 'flag\n0\n1\n';
        expect(parseCSV(csv)).toEqual([{ flag: 0 }, { flag: 1 }]);
    });
});

describe('parseData', () => {
    it('throws when called directly, since it only runs as an inlined build-time literal', () => {
        // This is deliberate, not a bug: the @motion-script/cli macro
        // replaces static parseData("file.csv") calls before this body ever
        // executes. Calling it directly (unresolved call, or missing plugin)
        // should fail loudly rather than silently return nothing.
        expect(() => parseData('missing.csv')).toThrow(/parseData\("missing\.csv"\)/);
    });
});
