import { describe, it, expect } from 'vitest';
import { AudioFilters, AudioFilterChain, resolveAudioFilters } from '@/attributes/audio/filters/chain';
import { fadeIn, ramp, isCurve } from '@/attributes/audio/filters/curve';

describe('AudioFilters builders', () => {
    it('gain produces a single gain filter', () => {
        expect([...AudioFilters.gain(2)]).toEqual([{ type: 'gain', value: 2 }]);
    });

    it('highpass/lowpass carry frequency and optional q', () => {
        expect([...AudioFilters.highpass(2000)]).toEqual([{ type: 'highpass', frequency: 2000, q: undefined }]);
        expect([...AudioFilters.lowpass({ frequency: 500, q: 0.7 })]).toEqual([{ type: 'lowpass', frequency: 500, q: 0.7 }]);
    });

    it('tremolo carries rate and depth', () => {
        expect([...AudioFilters.tremolo({ rate: 6, depth: 0.7 })]).toEqual([{ type: 'tremolo', rate: 6, depth: 0.7 }]);
    });

    it('tremolo defaults depth so the rate shorthand is usable alone', () => {
        expect([...AudioFilters.tremolo(6)]).toEqual([{ type: 'tremolo', rate: 6, depth: 0.5 }]);
    });

    it('speed carries the rate multiplier', () => {
        expect([...AudioFilters.speed(2)]).toEqual([{ type: 'speed', value: 2 }]);
    });

    it('echo carries delay, feedback, and optional mix', () => {
        expect([...AudioFilters.echo({ delay: 0.3, feedback: 0.45, mix: 0.5 })]).toEqual([
            { type: 'echo', delay: 0.3, feedback: 0.45, mix: 0.5 },
        ]);
    });

    it('echo defaults feedback so the delay shorthand is usable alone', () => {
        expect([...AudioFilters.echo(0.3)]).toEqual([
            { type: 'echo', delay: 0.3, feedback: 0.4, mix: undefined },
        ]);
    });

    it('volume is an alias for gain', () => {
        expect([...AudioFilters.volume(2)]).toEqual([{ type: 'gain', value: 2 }]);
        expect([...AudioFilters.gain(2).volume(1.5)]).toEqual([
            { type: 'gain', value: 2 },
            { type: 'gain', value: 1.5 },
        ]);
    });

    it('accepts a Curve as a param and stores it verbatim', () => {
        const curve = fadeIn(0.5).fadeOut(1);
        const [filter] = [...AudioFilters.volume(curve)];
        expect(filter.type).toBe('gain');
        if (filter.type !== 'gain') throw new Error('expected gain');
        expect(isCurve(filter.value)).toBe(true);
        expect(filter.value).toBe(curve);
    });

    it('mixes scalar and curve params across a chain', () => {
        const sweep = ramp(200, 2000, 1);
        const chain = AudioFilters.volume(fadeIn(0.5)).highpass(sweep).speed(1.2);
        const list = [...chain];
        const [gain, hp, spd] = list;
        if (gain.type !== 'gain' || hp.type !== 'highpass' || spd.type !== 'speed') {
            throw new Error('unexpected filter order');
        }
        expect(isCurve(gain.value)).toBe(true);       // gain curve
        expect(isCurve(hp.frequency)).toBe(true);     // highpass curve
        expect(spd.value).toBe(1.2);                  // scalar speed
    });
});

describe('AudioFilterChain', () => {
    it('appends filters in order while staying immutable', () => {
        const base = AudioFilters.gain(2);
        const extended = base.lowpass(800);
        expect(base.list).toHaveLength(1);
        expect(extended.list).toHaveLength(2);
        expect(extended.list).toEqual([
            { type: 'gain', value: 2 },
            { type: 'lowpass', frequency: 800, q: undefined },
        ]);
    });

    it('toJSON serializes to the raw filter array', () => {
        expect(AudioFilters.gain(2).echo({ delay: 0.3, feedback: 0.4 }).toJSON()).toEqual([
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
        const chain = AudioFilters.gain(2).lowpass(800);
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
