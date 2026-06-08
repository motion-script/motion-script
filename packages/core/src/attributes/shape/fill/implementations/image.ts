import type { BlendMode } from '../blend';
import type { MediaFilter } from '../../filters/union';
import type { FillData } from '../registry';

export type ImageFillMode = 'fill' | 'fit' | 'crop' | 'tile';
export type ImageTransform = Float32Array | number[][];

export interface ImageFillProp {
    type: 'image';
    src: string;
    mode?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

export interface ImageFillResolved {
    type: 'image';
    src: string;
    mode?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    filters?: MediaFilter[];
    opacity?: number;
    blend?: BlendMode;
}

export const imageFill: FillData<ImageFillResolved> = {
    resolve: (prop: ImageFillProp) => ({ ...prop }),
    lerp: (a, b, t) => ({
        src: t < 0.5 ? a.src : b.src,
        mode: a.mode ?? b.mode,
        transform: a.transform ?? b.transform,
        scaling: a.scaling ?? b.scaling,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
    }),
    update: (previous) => previous,
    equals: (a, b) => a.src === b.src,
    prepare: (fill, manager, width, height) => {
        manager.requestImage(fill.src, width, height);
    },
};
