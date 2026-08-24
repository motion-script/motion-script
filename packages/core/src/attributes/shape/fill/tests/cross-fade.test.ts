import { describe, it, expect } from 'vitest';
import { resolveFill, lerpFillArray } from '@/attributes/shape/fill/registry';
import type { FillResolved } from '@/attributes/shape/fill/union';

const RED: [number, number, number, number] = [1, 0, 0, 1];
const BLUE: [number, number, number, number] = [0, 0, 1, 1];

function color(c = RED, opacity?: number): FillResolved {
    return resolveFill({ type: 'solid', color: c, opacity });
}

function image(src = '@/attributes/shape/fill/a.png', opacity?: number): FillResolved {
    return resolveFill({ type: 'image', src, opacity } as never);
}

function video(src = '@/attributes/shape/fill/a.mp4', opacity?: number): FillResolved {
    return resolveFill({ type: 'video', src, opacity } as never);
}

describe('lerpFillArray cross-fade for non-interpolatable fills', () => {
    it('at t=0 emits only the outgoing fill at full opacity', () => {
        const out = lerpFillArray([color()], [image()], 0);
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe('solid');
        expect(out[0].opacity).toBe(1);
    });

    it('at t=1 emits only the incoming fill at full opacity', () => {
        const out = lerpFillArray([color()], [image()], 1);
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe('image');
        expect(out[0].opacity).toBe(1);
    });

    it('mid-tween stacks the outgoing fill beneath the incoming fill', () => {
        const out = lerpFillArray([color()], [image()], 0.25);
        expect(out).toHaveLength(2);
        // Outgoing first (painted beneath), incoming on top.
        expect(out[0].type).toBe('solid');
        expect(out[0].opacity).toBeCloseTo(0.75);
        expect(out[1].type).toBe('image');
        expect(out[1].opacity).toBeCloseTo(0.25);
    });

    it('scales each side by its own base opacity', () => {
        const out = lerpFillArray([color(RED, 0.8)], [image('@/attributes/shape/fill/a.png', 0.5)], 0.5);
        expect(out[0].opacity).toBeCloseTo(0.4); // 0.8 * (1 - 0.5)
        expect(out[1].opacity).toBeCloseTo(0.25); // 0.5 * 0.5
    });

    it('cross-fades between two unrelated media types (image ↔ video)', () => {
        const out = lerpFillArray([image()], [video()], 0.5);
        expect(out).toHaveLength(2);
        expect(out[0].type).toBe('image');
        expect(out[1].type).toBe('video');
    });

    it('still interpolates coercible pairs in place rather than cross-fading', () => {
        const out = lerpFillArray(
            [color(RED)],
            [resolveFill({ type: 'linear-gradient', colors: [RED, BLUE] })],
            0.5,
        );
        // One layer: the color was coerced into the gradient, not stacked.
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe('linear-gradient');
    });

    it('cross-fades per index, leaving other layers untouched', () => {
        const out = lerpFillArray(
            [color(RED), color(BLUE)],
            [image(), color(RED)],
            0.5,
        );
        // index 0: color↔image cross-fades into two layers; index 1: color↔color lerps to one.
        expect(out).toHaveLength(3);
        expect(out[0].type).toBe('solid'); // outgoing red
        expect(out[1].type).toBe('image'); // incoming image
        expect(out[2].type).toBe('solid'); // blue → red lerp
    });
});
