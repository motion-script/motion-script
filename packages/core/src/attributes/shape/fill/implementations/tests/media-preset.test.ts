import { describe, it, expect } from 'vitest';
import { lerpFill, resolveFillArray } from '@/attributes/shape/fill/registry';
import { Fills } from '@/attributes/shape/fill/chain';
import { Adjustments } from '@/attributes/shape/filters/chain';
import type { ImageFillResolved } from '@/attributes/shape/fill/implementations/image';
import type { VideoFillResolved } from '@/attributes/shape/fill/implementations/video';

const image = (
    adjustments?: ReturnType<typeof Adjustments.blur>,
    intensity?: number,
) =>
    resolveFillArray(
        Fills.image('photo.jpg', { preset: { adjustments, intensity } }),
    )[0] as ImageFillResolved;

describe('a media fill\'s preset through a tween', () => {
    it('interpolates an image fill\'s adjustments instead of holding the source ones', () => {
        const from = image(Adjustments.grayscale(0));
        const to = image(Adjustments.grayscale(1));
        const mid = lerpFill(from, to, 0.25) as ImageFillResolved;
        expect(mid.preset?.adjustments).toEqual([{ type: 'grayscale', amount: 0.25 }]);
    });

    it('interpolates an effect-backed adjustment the same way', () => {
        const from = image(Adjustments.oilPaint(0));
        const to = image(Adjustments.oilPaint(8));
        const mid = lerpFill(from, to, 0.5) as ImageFillResolved;
        expect(mid.preset?.adjustments).toEqual([{ type: 'oilPaint', radius: 4 }]);
    });

    it('leaves the preset absent when neither end is graded', () => {
        const mid = lerpFill(image(), image(), 0.5) as ImageFillResolved;
        expect(mid.preset).toBeUndefined();
    });

    it('interpolates a video fill\'s adjustments too', () => {
        const from = resolveFillArray(
            Fills.video('clip.mp4', { preset: { adjustments: Adjustments.blur(0) } }),
        )[0] as VideoFillResolved;
        const to = resolveFillArray(
            Fills.video('clip.mp4', { preset: { adjustments: Adjustments.blur(10) } }),
        )[0] as VideoFillResolved;
        const mid = lerpFill(from, to, 0.5) as VideoFillResolved;
        expect(mid.preset?.adjustments).toEqual([{ type: 'blur', radius: 5 }]);
    });
});

describe('intensity', () => {
    it('defaults to fully applied', () => {
        expect(image(Adjustments.blur(4)).preset?.intensity).toBe(1);
    });

    it('clamps out-of-range values rather than letting the mix extrapolate', () => {
        expect(image(Adjustments.blur(4), 2).preset?.intensity).toBe(1);
        expect(image(Adjustments.blur(4), -1).preset?.intensity).toBe(0);
    });

    it('interpolates as a number, so a grade can be dialled in on its own', () => {
        const from = image(Adjustments.blur(4), 0);
        const to = image(Adjustments.blur(4), 1);
        const mid = lerpFill(from, to, 0.5) as ImageFillResolved;
        expect(mid.preset?.intensity).toBe(0.5);
    });

    it('fades the mix out when the other end has no preset at all', () => {
        // The case the bare `filters` array could not express: `lerpFilterArray`
        // keeps a one-sided index as-is, so this used to hold grayscale at full
        // strength for the whole tween and then cut. The chain is held and the
        // mix falls instead.
        const from = image(Adjustments.grayscale(1), 0.4);
        const to = image();
        const mid = lerpFill(from, to, 0.5) as ImageFillResolved;
        expect(mid.preset?.intensity).toBeCloseTo(0.2);
        expect(mid.preset?.adjustments).toEqual([{ type: 'grayscale', amount: 1 }]);
    });

    it('fades a grade in from an ungraded fill, holding the target chain', () => {
        const mid = lerpFill(
            image(),
            image(Adjustments.grayscale(1), 1),
            0.25,
        ) as ImageFillResolved;
        expect(mid.preset?.intensity).toBe(0.25);
        expect(mid.preset?.adjustments).toEqual([{ type: 'grayscale', amount: 1 }]);
    });
});

describe('the deprecated `filters` prop', () => {
    it('is folded into the preset, so an old scene grades unchanged', () => {
        const fill = resolveFillArray(
            Fills.image('photo.jpg', { filters: Adjustments.grayscale(1) }),
        )[0] as ImageFillResolved;
        expect(fill.preset).toEqual({
            adjustments: [{ type: 'grayscale', amount: 1 }],
            intensity: 1,
        });
    });

    it('does not survive onto the resolved fill under its old name', () => {
        const fill = resolveFillArray(
            Fills.image('photo.jpg', { filters: Adjustments.grayscale(1) }),
        )[0] as ImageFillResolved & { filters?: unknown };
        expect(fill.filters).toBeUndefined();
    });

    it('loses to `preset` when a fill somehow carries both', () => {
        const fill = resolveFillArray(
            Fills.image('photo.jpg', {
                filters: Adjustments.grayscale(1),
                preset: { adjustments: Adjustments.blur(3) },
            }),
        )[0] as ImageFillResolved;
        expect(fill.preset?.adjustments).toEqual([{ type: 'blur', radius: 3 }]);
    });
});
