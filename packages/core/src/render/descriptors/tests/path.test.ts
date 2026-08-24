import { describe, it, expect } from 'vitest';
import { toPathString, PathCommand } from '@/render/descriptors/path';

describe('toPathString', () => {
    it('passes a string path through unchanged', () => {
        expect(toPathString('M0 0 L10 10')).toBe('M0 0 L10 10');
    });

    it('serializes move and line commands', () => {
        const cmds: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 10, y: 20 },
        ];
        expect(toPathString(cmds)).toBe('M 0 0 L 10 20');
    });

    it('serializes horizontal and vertical commands with a single coordinate', () => {
        expect(toPathString([{ type: 'H', x: 5 }])).toBe('H 5');
        expect(toPathString([{ type: 'V', y: 8 }])).toBe('V 8');
    });

    it('serializes a cubic command with all six coordinates', () => {
        const cmds: PathCommand[] = [{ type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }];
        expect(toPathString(cmds)).toBe('C 1 2 3 4 5 6');
    });

    it('serializes an arc command with flags', () => {
        const cmds: PathCommand[] = [
            { type: 'A', rx: 5, ry: 5, rotation: 0, largeArc: 1, sweep: 0, x: 10, y: 10 },
        ];
        expect(toPathString(cmds)).toBe('A 5 5 0 1 0 10 10');
    });

    it('serializes a close command as the bare letter', () => {
        expect(toPathString([{ type: 'Z' }])).toBe('Z');
    });

    it('joins multiple commands with spaces', () => {
        const cmds: PathCommand[] = [
            { type: 'M', x: 0, y: 0 },
            { type: 'L', x: 1, y: 1 },
            { type: 'Z' },
        ];
        expect(toPathString(cmds)).toBe('M 0 0 L 1 1 Z');
    });
});
