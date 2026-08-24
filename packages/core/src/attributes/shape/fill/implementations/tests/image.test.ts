import { describe, it, expect } from 'vitest';
import { resolveFill, lerpFill } from '@/attributes/shape/fill/registry';
import { Fills } from '@/attributes/shape/fill/chain';
import { Image } from '@/nodes/media/image-node';
import type { ImageFillProp, ImageFillResolved } from '@/attributes/shape/fill/implementations/image';
import type { InsetsResolved } from '@/attributes/layout/insets';
import type { Vector2 } from '@/attributes/layout/vector2';

const SRC = 'photo.jpg';

function image(prop: Partial<ImageFillProp> = {}): ImageFillResolved {
    return resolveFill({ type: 'image', src: SRC, ...prop } as ImageFillProp) as ImageFillResolved;
}

describe('image fill placement — resolve', () => {
    it('leaves crop and anchor undefined when unset, so the cheap path stays cheap', () => {
        const fill = image();
        expect(fill.crop).toBeUndefined();
        expect(fill.anchor).toBeUndefined();
        expect(fill.zoom).toBeUndefined();
    });

    it('resolves a crop through the Insets shorthands', () => {
        expect(image({ crop: 0.1 }).crop).toEqual({ left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
        expect(image({ crop: { horizontal: 0.2 } }).crop).toEqual({ left: 0.2, right: 0.2, top: 0, bottom: 0 });
        expect(image({ crop: { left: 0.1, top: 0.05 } }).crop).toEqual({ left: 0.1, right: 0, top: 0.05, bottom: 0 });
    });

    it('resolves a named anchor into the [-1,1] y-up space shared with pivot/align', () => {
        expect(image({ anchor: 'center' }).anchor).toEqual({ x: 0, y: 0 });
        expect(image({ anchor: 'topLeft' }).anchor).toEqual({ x: -1, y: 1 });
        expect(image({ anchor: 'bottomRight' }).anchor).toEqual({ x: 1, y: -1 });
        expect(image({ anchor: { x: 0.5, y: -0.25 } }).anchor).toEqual({ x: 0.5, y: -0.25 });
    });

    it('is idempotent — a resolved fill re-resolves to itself', () => {
        const once = image({ crop: { horizontal: 0.2 }, anchor: 'topRight', zoom: 2 });
        const twice = resolveFill(once as never) as ImageFillResolved;
        expect(twice.crop).toEqual(once.crop);
        expect(twice.anchor).toEqual(once.anchor);
    });
});

describe('image fill placement — lerp', () => {
    const from = image({ zoom: 1, anchor: 'center' });
    const to = image({ zoom: 3, anchor: 'centerRight' });

    it('interpolates zoom', () => {
        expect((lerpFill(from, to, 0.5) as ImageFillResolved).zoom).toBeCloseTo(2);
    });

    it('slides the anchor rather than snapping it', () => {
        const mid = (lerpFill(from, to, 0.5) as ImageFillResolved).anchor as Vector2;
        expect(mid.x).toBeCloseTo(0.5);
        expect(mid.y).toBeCloseTo(0);
    });

    it('opens a crop from nothing, treating the uncropped side as zero', () => {
        const uncropped = image();
        const cropped = image({ crop: { horizontal: 0.4 } });
        const mid = (lerpFill(uncropped, cropped, 0.5) as ImageFillResolved).crop as InsetsResolved;
        expect(mid).toEqual({ left: 0.2, right: 0.2, top: 0, bottom: 0 });
    });

    it('stays uncropped when neither side crops', () => {
        expect((lerpFill(image(), image({ zoom: 2 }), 0.5) as ImageFillResolved).crop).toBeUndefined();
    });

    it('defaults a missing zoom to 1 rather than 0, so a fill never collapses mid-tween', () => {
        const mid = (lerpFill(image(), image({ zoom: 5 }), 0.5) as ImageFillResolved).zoom;
        expect(mid).toBeCloseTo(3);
    });
});

describe('Fills.image builder', () => {
    it('carries the placement options onto the prop', () => {
        const [layer] = Fills.image(SRC, { fit: 'fit', crop: 0.25, zoom: 1.5, anchor: 'topLeft' }).list;
        expect(layer).toMatchObject({ type: 'image', src: SRC, fit: 'fit', crop: 0.25, zoom: 1.5, anchor: 'topLeft' });
    });
});

describe('Image node', () => {
    it('resolves its placement props the same way the fill does', () => {
        const node = new Image({ src: SRC, crop: { horizontal: 0.2 }, anchor: 'topLeft', zoom: 2 });
        expect(node.crop).toEqual({ left: 0.2, right: 0.2, top: 0, bottom: 0 });
        expect(node.anchor).toEqual({ x: -1, y: 1 });
        expect(node.zoom).toBe(2);
    });

    it('defaults to an uncropped, centred, unzoomed image', () => {
        const node = new Image({ src: SRC });
        expect(node.crop).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
        expect(node.anchor).toEqual({ x: 0, y: 0 });
        expect(node.zoom).toBe(1);
    });
});
