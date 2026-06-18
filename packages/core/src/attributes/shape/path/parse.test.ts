import { describe, it, expect } from 'vitest';
import { parsePathString, toPathCommands } from '@/attributes/shape/path/parse';

describe('parsePathString – basic commands', () => {
    it('parses a move and line', () => {
        expect(parsePathString('M 0 0 L 10 20')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 20 },
        ]);
    });

    it('parses cubic, quadratic, smooth, and arc commands', () => {
        const cmds = parsePathString('M0 0 C1 2 3 4 5 6 S7 8 9 10 Q1 1 2 2 T3 3 A2 2 0 1 0 4 4 Z');
        expect(cmds[0]).toEqual({ type: 'M', x: 0, y: 0 });
        expect(cmds[1]).toEqual({ type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 });
        expect(cmds[2]).toEqual({ type: 'S', x2: 7, y2: 8, x: 9, y: 10 });
        expect(cmds[3]).toEqual({ type: 'Q', x1: 1, y1: 1, x: 2, y: 2 });
        expect(cmds[4]).toEqual({ type: 'T', x: 3, y: 3 });
        expect(cmds[5]).toEqual({ type: 'A', rx: 2, ry: 2, rotation: 0, largeArc: 1, sweep: 0, x: 4, y: 4 });
        expect(cmds[6]).toEqual({ type: 'Z' });
    });

    it('parses H and V', () => {
        expect(parsePathString('M0 0 H10 V20')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'H', x: 10 },
            { type: 'V', y: 20 },
        ]);
    });

    it('normalizes lowercase z to uppercase Z', () => {
        const cmds = parsePathString('M0 0 L1 1 z');
        expect(cmds[cmds.length - 1]).toEqual({ type: 'Z' });
    });
});

describe('parsePathString – formatting tolerance', () => {
    it('handles comma and no-space separators', () => {
        expect(parsePathString('M0,0L10,20')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 20 },
        ]);
    });

    it('handles negative numbers packed against the previous value', () => {
        expect(parsePathString('M0 0L-10-20')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: -10, y: -20 },
        ]);
    });

    it('parses scientific notation', () => {
        const cmds = parsePathString('M 1e2 2e-1 L 3 4');
        expect(cmds[0]).toEqual({ type: 'M', x: 100, y: 0.2 });
    });
});

describe('parsePathString – implicit repeated commands', () => {
    it('treats extra L coordinate pairs as repeated line-tos', () => {
        expect(parsePathString('M0 0 L1 1 2 2 3 3')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 1, y: 1 },
            { type: 'L', x: 2, y: 2 },
            { type: 'L', x: 3, y: 3 },
        ]);
    });

    it('treats extra coordinate pairs after M as implicit line-tos', () => {
        expect(parsePathString('M0 0 1 1 2 2')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 1, y: 1 },
            { type: 'L', x: 2, y: 2 },
        ]);
    });

    it('treats extra pairs after m as implicit relative line-tos', () => {
        expect(parsePathString('m0 0 1 1')).toEqual([
            { type: 'm', x: 0, y: 0 },
            { type: 'l', x: 1, y: 1 },
        ]);
    });

    it('repeats cubic commands when extra arguments follow', () => {
        const cmds = parsePathString('M0 0 C1 1 2 2 3 3 4 4 5 5 6 6');
        expect(cmds).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'C', x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 },
            { type: 'C', x1: 4, y1: 4, x2: 5, y2: 5, x: 6, y: 6 },
        ]);
    });
});

describe('toPathCommands', () => {
    it('parses a string input', () => {
        expect(toPathCommands('M0 0 L1 1')).toEqual([
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 1, y: 1 },
        ]);
    });

    it('passes a command array through unchanged', () => {
        const cmds = [{ type: 'M', x: 0, y: 0 } as const];
        expect(toPathCommands(cmds)).toBe(cmds);
    });
});
