import { describe, it, expect } from 'vitest';
import { lerpFill, resolveFillArray } from '@/attributes/shape/fill/registry';
import { Fills } from '@/attributes/shape/fill/chain';
import { ImageFilters } from '@/attributes/shape/filters/chain';
import type { ImageFillResolved } from '@/attributes/shape/fill/implementations/image';
import type { VideoFillResolved } from '@/attributes/shape/fill/implementations/video';

const image = (filters?: ReturnType<typeof ImageFilters.blur>) =>
    resolveFillArray(Fills.image('photo.jpg', { filters }))[0] as ImageFillResolved;

describe('media-fill filters through a tween', () => {
    it('interpolates an image fill\'s filters instead of holding the source ones', () => {
        const from = image(ImageFilters.grayscale(0));
        const to = image(ImageFilters.grayscale(1));
        const mid = lerpFill(from, to, 0.25) as ImageFillResolved;
        expect(mid.filters).toEqual([{ type: 'grayscale', amount: 0.25 }]);
    });

    it('interpolates an effect-backed filter the same way', () => {
        const from = image(ImageFilters.oilPaint(0));
        const to = image(ImageFilters.oilPaint(8));
        const mid = lerpFill(from, to, 0.5) as ImageFillResolved;
        expect(mid.filters).toEqual([{ type: 'oilPaint', radius: 4 }]);
    });

    it('leaves the field absent when neither end has a filter', () => {
        const mid = lerpFill(image(), image(), 0.5) as ImageFillResolved;
        expect(mid.filters).toBeUndefined();
    });

    it('interpolates a video fill\'s filters too', () => {
        const from = resolveFillArray(
            Fills.video('clip.mp4', { filters: ImageFilters.blur(0) }),
        )[0] as VideoFillResolved;
        const to = resolveFillArray(
            Fills.video('clip.mp4', { filters: ImageFilters.blur(10) }),
        )[0] as VideoFillResolved;
        const mid = lerpFill(from, to, 0.5) as VideoFillResolved;
        expect(mid.filters).toEqual([{ type: 'blur', radius: 5 }]);
    });
});
