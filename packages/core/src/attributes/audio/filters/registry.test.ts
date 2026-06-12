import { describe, it, expect } from 'vitest';
import { AudioFilterRegistry } from '@/attributes/audio/filters/registry';
// Side-effect imports register each handler.
import '@/attributes/audio/filters/implementations/gain';
import '@/attributes/audio/filters/implementations/highpass';
import '@/attributes/audio/filters/implementations/lowpass';
import '@/attributes/audio/filters/implementations/tremolo';
import '@/attributes/audio/filters/implementations/speed';
import '@/attributes/audio/filters/implementations/echo';
import type { AudioFilter } from '@/attributes/audio/filters/union';

describe('AudioFilterRegistry registration', () => {
    it('registers all six built-in filters', () => {
        for (const type of ['gain', 'highpass', 'lowpass', 'tremolo', 'speed', 'echo']) {
            expect(AudioFilterRegistry.has(type)).toBe(true);
        }
    });
});

describe('AudioFilterRegistry.lerp', () => {
    it('lerps gain linearly', () => {
        const r = AudioFilterRegistry.lerp({ type: 'gain', value: 0 }, { type: 'gain', value: 2 }, 0.5);
        expect(r).toEqual({ type: 'gain', value: 1 });
    });

    it('lerps echo across all params, defaulting mix to 0.5', () => {
        const r = AudioFilterRegistry.lerp(
            { type: 'echo', delay: 0, feedback: 0 },
            { type: 'echo', delay: 0.4, feedback: 0.8, mix: 1 },
            0.5,
        );
        expect(r).toEqual({ type: 'echo', delay: 0.2, feedback: 0.4, mix: 0.75 });
    });

    it('hard-cuts at t=0.5 when types differ', () => {
        const from: AudioFilter = { type: 'gain', value: 1 };
        const to: AudioFilter = { type: 'speed', value: 2 };
        expect(AudioFilterRegistry.lerp(from, to, 0.4)).toBe(from);
        expect(AudioFilterRegistry.lerp(from, to, 0.6)).toBe(to);
    });
});

describe('AudioFilterRegistry.equals', () => {
    it('treats omitted optional params as their default', () => {
        const echo = AudioFilterRegistry.get('echo')!;
        expect(echo.equals(
            { type: 'echo', delay: 0.3, feedback: 0.4 } as AudioFilter,
            { type: 'echo', delay: 0.3, feedback: 0.4, mix: 0.5 } as AudioFilter,
        )).toBe(true);
    });
});

describe('AudioFilterRegistry.lerpArray', () => {
    it('lerps matched indices and keeps unmatched ones', () => {
        const from: AudioFilter[] = [{ type: 'gain', value: 0 }];
        const to: AudioFilter[] = [{ type: 'gain', value: 2 }, { type: 'speed', value: 2 }];
        expect(AudioFilterRegistry.lerpArray(from, to, 0.5)).toEqual([
            { type: 'gain', value: 1 },
            { type: 'speed', value: 2 },
        ]);
    });
});
