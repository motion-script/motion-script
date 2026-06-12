import { describe, it, expect } from 'vitest';
import { AFX, AudioFilterChain, resolveAudioFilters } from '@/attributes/audio/filters/chain';

describe('AFX builders', () => {
    it('gain produces a single gain filter', () => {
        expect([...AFX.gain(2)]).toEqual([{ type: 'gain', value: 2 }]);
    });

    it('highpass/lowpass carry frequency and optional q', () => {
        expect([...AFX.highpass(2000)]).toEqual([{ type: 'highpass', frequency: 2000, q: undefined }]);
        expect([...AFX.lowpass(500, 0.7)]).toEqual([{ type: 'lowpass', frequency: 500, q: 0.7 }]);
    });

    it('tremolo carries rate and depth', () => {
        expect([...AFX.tremolo(6, 0.7)]).toEqual([{ type: 'tremolo', rate: 6, depth: 0.7 }]);
    });

    it('speed carries the rate multiplier', () => {
        expect([...AFX.speed(2)]).toEqual([{ type: 'speed', value: 2 }]);
    });

    it('echo carries delay, feedback, and optional mix', () => {
        expect([...AFX.echo(0.3, 0.45, 0.5)]).toEqual([
            { type: 'echo', delay: 0.3, feedback: 0.45, mix: 0.5 },
        ]);
    });
});

describe('AudioFilterChain', () => {
    it('appends filters in order while staying immutable', () => {
        const base = AFX.gain(2);
        const extended = base.lowpass(800);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list).toEqual([
            { type: 'gain', value: 2 },
            { type: 'lowpass', frequency: 800, q: undefined },
        ]);
    });

    it('toJSON serializes to the raw filter array', () => {
        expect(AFX.gain(2).echo(0.3, 0.4).toJSON()).toEqual([
            { type: 'gain', value: 2 },
            { type: 'echo', delay: 0.3, feedback: 0.4, mix: undefined },
        ]);
    });
});

describe('resolveAudioFilters', () => {
    it('returns [] for undefined', () => {
        expect(resolveAudioFilters(undefined)).toEqual([]);
    });

    it('unwraps a chain to its list', () => {
        const chain = AFX.gain(2).lowpass(800);
        expect(resolveAudioFilters(chain)).toBe(chain.list);
    });

    it('passes a plain array through', () => {
        const arr = [{ type: 'gain', value: 2 } as const];
        expect(resolveAudioFilters(arr)).toBe(arr);
    });

    it('wraps a single filter in an array', () => {
        expect(resolveAudioFilters({ type: 'gain', value: 2 })).toEqual([{ type: 'gain', value: 2 }]);
    });

    it('handles a bare AudioFilterChain instance', () => {
        expect(resolveAudioFilters(new AudioFilterChain())).toEqual([]);
    });
});
