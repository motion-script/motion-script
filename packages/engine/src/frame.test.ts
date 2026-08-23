import { describe, expect, it } from 'vitest';
import { parseFrameSelector, toFrameSpec } from './frame.js';
import { EngineError } from './errors.js';

describe('parseFrameSelector', () => {
    it('accepts the timeline ends, case-insensitively', () => {
        expect(parseFrameSelector('first')).toEqual({ kind: 'first' });
        expect(parseFrameSelector('LAST')).toEqual({ kind: 'last' });
    });

    it('reads a numeric selector as a frame index, never as seconds', () => {
        expect(parseFrameSelector(42)).toEqual({ kind: 'frame', frame: 42 });
        expect(parseFrameSelector(0)).toEqual({ kind: 'frame', frame: 0 });
    });

    it('rejects a fractional number rather than reinterpreting it as a time', () => {
        // The unit must not change silently: `duration * 0.5` is a bug, not a request in seconds.
        expect(() => parseFrameSelector(2.5)).toThrow(EngineError);
        expect(() => parseFrameSelector(2.5)).toThrow(/whole frame index/);
    });

    it('splits text on the integer/decimal boundary, the way a CLI flag reads', () => {
        expect(parseFrameSelector('42')).toEqual({ kind: 'frame', frame: 42 });
        expect(parseFrameSelector('2.5')).toEqual({ kind: 'time', seconds: 2.5 });
        expect(parseFrameSelector('2.5s')).toEqual({ kind: 'time', seconds: 2.5 });
        expect(parseFrameSelector('3s')).toEqual({ kind: 'time', seconds: 3 });
    });

    it('accepts an explicit unit object', () => {
        expect(parseFrameSelector({ frame: 7 })).toEqual({ kind: 'frame', frame: 7 });
        expect(parseFrameSelector({ seconds: 1.25 })).toEqual({ kind: 'time', seconds: 1.25 });
    });

    it('rejects malformed and negative selectors with INVALID_OPTION', () => {
        for (const bad of ['', '   ', 'middle', '-1', -3, {}, null as never, 'xs']) {
            let code: string | undefined;
            try {
                parseFrameSelector(bad as never);
            } catch (err) {
                code = (err as EngineError).code;
            }
            expect(code, `expected ${JSON.stringify(bad)} to be rejected`).toBe('INVALID_OPTION');
        }
    });
});

describe('toFrameSpec', () => {
    it('converts a time to the nearest frame at the project rate', () => {
        expect(toFrameSpec({ kind: 'time', seconds: 2.5 }, 60)).toEqual({ kind: 'frame', frame: 150 });
        expect(toFrameSpec({ kind: 'time', seconds: 1 / 3 }, 30)).toEqual({ kind: 'frame', frame: 10 });
    });

    it('passes frame and end selectors through untouched', () => {
        expect(toFrameSpec({ kind: 'frame', frame: 9 }, 60)).toEqual({ kind: 'frame', frame: 9 });
        expect(toFrameSpec({ kind: 'last' }, 60)).toEqual({ kind: 'last' });
    });
});
