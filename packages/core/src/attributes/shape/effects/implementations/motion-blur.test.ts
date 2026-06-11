import { describe, it, expect } from 'vitest';
import {
    motionBlurEffect,
    resolveMotionBlurAxis,
    resolveMotionBlurAlignment,
    type MotionBlurEffect,
} from '@/attributes/shape/effects/implementations/motion-blur';

const base: MotionBlurEffect = {
    type: 'motionBlur',
    length: 50,
    alignment: 'centered',
    samples: 16,
    strength: 1,
    axis: 'both',
};

describe('resolveMotionBlurAxis', () => {
    it('maps the string presets to per-axis scales', () => {
        expect(resolveMotionBlurAxis('x')).toEqual({ x: 1, y: 0 });
        expect(resolveMotionBlurAxis('y')).toEqual({ x: 0, y: 1 });
        expect(resolveMotionBlurAxis('both')).toEqual({ x: 1, y: 1 });
    });

    it('passes a Vector2 through', () => {
        expect(resolveMotionBlurAxis({ x: 0.5, y: 0.25 })).toEqual({ x: 0.5, y: 0.25 });
    });
});

describe('resolveMotionBlurAlignment', () => {
    it('maps the string presets to a phase in -1..1', () => {
        expect(resolveMotionBlurAlignment('behind')).toBe(-1);
        expect(resolveMotionBlurAlignment('centered')).toBe(0);
        expect(resolveMotionBlurAlignment('ahead')).toBe(1);
    });

    it('clamps numeric phases to -1..1', () => {
        expect(resolveMotionBlurAlignment(0.3)).toBe(0.3);
        expect(resolveMotionBlurAlignment(5)).toBe(1);
        expect(resolveMotionBlurAlignment(-5)).toBe(-1);
    });
});

describe('motionBlurEffect.lerp', () => {
    it('interpolates numeric params', () => {
        const to: MotionBlurEffect = { ...base, length: 100, samples: 32, strength: 3 };
        const mid = motionBlurEffect.lerp(base, to, 0.5);
        expect(mid.length).toBe(75);
        expect(mid.samples).toBe(24);
        expect(mid.strength).toBe(2);
    });

    it('sweeps alignment presets numerically', () => {
        const from: MotionBlurEffect = { ...base, alignment: 'behind' };
        const to: MotionBlurEffect = { ...base, alignment: 'ahead' };
        expect(motionBlurEffect.lerp(from, to, 0.5).alignment).toBe(0);
    });

    it('lerps axis presets componentwise', () => {
        const from: MotionBlurEffect = { ...base, axis: 'x' };
        const to: MotionBlurEffect = { ...base, axis: 'y' };
        expect(motionBlurEffect.lerp(from, to, 0.5).axis).toEqual({ x: 0.5, y: 0.5 });
    });
});

describe('motionBlurEffect.equals', () => {
    it('treats equivalent axis/alignment forms as equal', () => {
        expect(motionBlurEffect.equals(
            { ...base, axis: 'both', alignment: 'centered' },
            { ...base, axis: { x: 1, y: 1 }, alignment: 0 },
        )).toBe(true);
    });

    it('detects a differing length', () => {
        expect(motionBlurEffect.equals(base, { ...base, length: 51 })).toBe(false);
    });
});
