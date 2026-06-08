import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';

export interface SolidFillProp {
    type: 'color';
    color: Color;
    opacity?: number;
    blend?: BlendMode;
}

export interface SolidFillResolved {
    type: 'color';
    color: NormalizedColor;
    opacity?: number;
    blend?: BlendMode;
}

export const colorFill: FillData<SolidFillResolved> = {
    resolve: (prop: SolidFillProp) => ({
        type: 'color',
        color: Array.isArray(prop.color)
            ? (prop.color as NormalizedColor)
            : parseColor(prop.color as string),
        opacity: prop.opacity,
        blend: prop.blend,
    }),
    lerp: (a, b, t) => ({
        color: [
            lerpNumber(a.color[0], b.color[0], t),
            lerpNumber(a.color[1], b.color[1], t),
            lerpNumber(a.color[2], b.color[2], t),
            lerpNumber(a.color[3], b.color[3], t),
        ],
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
    }),
    update: (previous) => previous,
    equals: (a, b) => a.color === b.color,
};
