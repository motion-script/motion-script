import { describe, it, expect } from 'vitest';
import { diffCode } from './diff';
import { makeIdLine, makeIdToken, type IdLine } from './tokens';

/**
 * Build a structure by hand rather than through the tokenizer: these are tests
 * of the *diff*, and the grammar is not loaded in a unit run anyway (the
 * tokenizer would hand back one flat token per line and hide every alignment
 * question worth asking).
 */
function lines(rows: string[][]): IdLine[] {
    return rows.map(tokens => makeIdLine(tokens.map(t => makeIdToken(t))));
}

function idsOf(line: IdLine): number[] {
    return line.tokens.map(t => t.id);
}

describe('diffCode', () => {
    it('keeps the identity of tokens a one-word edit did not touch', () => {
        const before = lines([['const', ' ', 'variable', ' ', '=', ' ', '3', ';']]);
        const after = lines([['const', ' ', 'number', ' ', '=', ' ', '3', ';']]);
        const kept = idsOf(before[0]);

        const edit = diffCode(before, after);

        // `const`, the spaces, `=`, `3` and `;` all survive — only the name is
        // replaced, which is the whole point: they move, they don't re-enter.
        const surviving = idsOf(edit.lines[0]);
        expect(surviving[0]).toBe(kept[0]);
        expect(surviving[4]).toBe(kept[4]);
        expect(surviving[6]).toBe(kept[6]);
        expect(surviving[7]).toBe(kept[7]);

        expect(edit.removedIds).toEqual(new Set([kept[2]]));
        expect(edit.addedIds).toEqual(new Set([surviving[2]]));
        expect(edit.newLineIds.size).toBe(0);
    });

    it('keeps a line identity when the line was edited, not replaced', () => {
        const before = lines([['a', '(', '1', ')']]);
        const after = lines([['a', '(', '2', ')']]);
        const lineId = before[0].id;

        const edit = diffCode(before, after);

        expect(edit.lines[0].id).toBe(lineId);
        expect(edit.newLineIds.size).toBe(0);
    });

    it('treats a wholly different line as a new row rather than an edit', () => {
        const before = lines([['const', ' ', 'x', ' ', '=', ' ', '1', ';']]);
        const after = lines([['throw', ' ', 'new', ' ', 'Error', '(', ')']]);

        const edit = diffCode(before, after);

        expect(edit.newLineIds).toEqual(new Set([edit.lines[0].id]));
        expect(edit.lines[0].id).not.toBe(before[0].id);
    });

    it('reports appended rows as new and leaves the rest untouched', () => {
        const before = lines([['one'], ['two']]);
        const after = lines([['one'], ['two'], ['three']]);
        const keptLineIds = before.map(l => l.id);
        const keptTokenIds = before.flatMap(idsOf);

        const edit = diffCode(before, after);

        expect(edit.lines.slice(0, 2).map(l => l.id)).toEqual(keptLineIds);
        expect(edit.lines.slice(0, 2).flatMap(idsOf)).toEqual(keptTokenIds);
        expect(edit.newLineIds).toEqual(new Set([edit.lines[2].id]));
        expect(edit.removedIds.size).toBe(0);
    });

    it('reports prepended rows as new without disturbing the rows below', () => {
        const before = lines([['body']]);
        const after = lines([['import'], ['body']]);
        const keptLineId = before[0].id;

        const edit = diffCode(before, after);

        expect(edit.lines[1].id).toBe(keptLineId);
        expect(edit.newLineIds).toEqual(new Set([edit.lines[0].id]));
    });

    it('reports a deleted row as removed and keeps its neighbours', () => {
        const before = lines([['head'], ['debug'], ['tail']]);
        const after = lines([['head'], ['tail']]);
        const goneId = before[1].tokens[0].id;

        const edit = diffCode(before, after);

        expect(edit.removedIds).toEqual(new Set([goneId]));
        expect(edit.addedIds.size).toBe(0);
        expect(edit.lines.map(l => l.id)).toEqual([before[0].id, before[2].id]);
    });

    it('records the previous colour of a token whose highlighting changed', () => {
        const before: IdLine[] = [makeIdLine([makeIdToken('name', '#aaa')])];
        const after: IdLine[] = [makeIdLine([makeIdToken('name', '#bbb')])];
        const id = before[0].tokens[0].id;

        const edit = diffCode(before, after);

        expect(edit.lines[0].tokens[0].id).toBe(id);
        expect(edit.fromColorById.get(id)).toBe('#aaa');
        expect(edit.removedIds.size).toBe(0);
    });

    it('matches on visible content, not on the whitespace between it', () => {
        // Re-indenting a line must not be read as "the two-space token moved and
        // everything else is new".
        const before = lines([['  ', 'return', ' ', 'sum', ';']]);
        const after = lines([['    ', 'return', ' ', 'sum', ';']]);
        const keptReturn = before[0].tokens[1].id;

        const edit = diffCode(before, after);

        expect(edit.lines[0].tokens[1].id).toBe(keptReturn);
        expect(edit.newLineIds.size).toBe(0);
    });

    it('handles an empty starting listing', () => {
        const edit = diffCode([], lines([['hello']]));
        expect(edit.newLineIds.size).toBe(1);
        expect(edit.removedIds.size).toBe(0);
    });
});
