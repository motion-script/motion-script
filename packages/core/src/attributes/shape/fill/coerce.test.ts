import { describe, it, expect } from 'vitest';
import { resolveFill, lerpFill } from '@/attributes/shape/fill/registry';
import type { FillResolved } from '@/attributes/shape/fill/union';
import type { SolidFillResolved } from '@/attributes/shape/fill/implementations/color';
import type { LinearGradientFillResolved } from '@/attributes/shape/fill/implementations/linear-gradient';
import type { RadialGradientFillResolved } from '@/attributes/shape/fill/implementations/radial-gradient';

const RED: [number, number, number, number] = [1, 0, 0, 1];
const BLUE: [number, number, number, number] = [0, 0, 1, 1];

function color(c = RED): FillResolved {
    return resolveFill({ type: 'color', color: c });
}

function linear(colors = [RED, BLUE]): FillResolved {
    return resolveFill({ type: 'linear-gradient', colors });
}

function radial(colors = [RED, BLUE]): FillResolved {
    return resolveFill({ type: 'radial-gradient', colors });
}

describe('cross-type fill lerp (color ↔ gradient)', () => {
    it('color → linear-gradient adopts the gradient type', () => {
        const out = lerpFill(color(), linear(), 0.5);
        expect(out.type).toBe('linear-gradient');
    });

    it('at t=0 a color → gradient tween renders as the flat color', () => {
        // Frame 0 must be a uniform gradient: every stop equals the source color.
        const out = lerpFill(color(RED), linear([BLUE, BLUE]), 0) as LinearGradientFillResolved;
        expect(out.type).toBe('linear-gradient');
        for (const c of out.colors) expect(c).toEqual(RED);
    });

    it('at t=1 a color → gradient tween equals the destination gradient', () => {
        const dest = linear([RED, BLUE]) as LinearGradientFillResolved;
        const out = lerpFill(color(BLUE), dest, 1) as LinearGradientFillResolved;
        expect(out.colors).toEqual(dest.colors);
        expect(out.start).toEqual(dest.start);
        expect(out.end).toEqual(dest.end);
    });

    it('gradient → color is symmetric (color expands to the gradient type)', () => {
        const out = lerpFill(radial(), color(), 1) as RadialGradientFillResolved;
        expect(out.type).toBe('radial-gradient');
        // Landing fully on the color: every stop is that color.
        for (const c of out.colors) expect(c).toEqual(RED);
    });

    it('interpolates colors at the midpoint of a color → gradient tween', () => {
        // from = solid red expanded to [red, red]; to = [red, blue].
        const out = lerpFill(color(RED), linear([RED, BLUE]), 0.5) as LinearGradientFillResolved;
        expect(out.colors[0]).toEqual(RED); // red → red
        expect(out.colors[1]).toEqual([0.5, 0, 0.5, 1]); // red → blue midpoint
    });

    it('matches the destination gradient stop count when expanding a color', () => {
        const dest = linear([RED, BLUE, RED]) as LinearGradientFillResolved;
        const out = lerpFill(color(BLUE), dest, 0) as LinearGradientFillResolved;
        expect(out.colors.length).toBe(3);
    });
});

describe('cross-type fill lerp (gradient ↔ gradient of different kinds)', () => {
    it('linear → radial coerces toward the destination type', () => {
        const out = lerpFill(linear(), radial(), 0.5);
        expect(out.type).toBe('radial-gradient');
    });

    it('interpolates the shared colors across differing gradient kinds', () => {
        const out = lerpFill(
            linear([RED, RED]),
            radial([BLUE, BLUE]),
            0.5,
        ) as RadialGradientFillResolved;
        expect(out.colors[0]).toEqual([0.5, 0, 0.5, 1]);
    });
});

describe('cross-type fill lerp guards', () => {
    it('still throws for genuinely non-interpolatable types', () => {
        const img = resolveFill({ type: 'image', src: './a.png' } as never);
        expect(() => lerpFill(color(), img, 0.5)).toThrow(/No registered lerp/);
    });

    it('preserves same-type behavior for two solid colors', () => {
        const out = lerpFill(color(RED), color(BLUE), 0.5) as SolidFillResolved;
        expect(out.type).toBe('color');
        expect(out.color).toEqual([0.5, 0, 0.5, 1]);
    });
});
