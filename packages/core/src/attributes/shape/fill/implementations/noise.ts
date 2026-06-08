import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';
import { Vector2 } from '@/attributes/layout/vector2';

export interface NoiseFillProp {
    type: 'noise';
    size?: Vector2;
    density?: number;
    color?: Color;
    opacity?: number;
    blend?: BlendMode;
}

export interface NoiseFillResolved {
    type: 'noise';
    size: Vector2;
    density: number;
    color: NormalizedColor;
    opacity?: number;
    blend?: BlendMode;
}

export const noiseFill: FillData<NoiseFillResolved> = {
    resolve: (prop: NoiseFillProp) => {
        const raw = prop.color ?? ([0, 0, 0, 1] as NormalizedColor);
        return {
            type: 'noise',
            size: prop.size ?? { x: 1, y: 1 },
            density: prop.density ?? 1,
            color: Array.isArray(raw) ? (raw as NormalizedColor) : parseColor(raw as string),
            opacity: prop.opacity,
            blend: prop.blend,
        };
    },
    lerp: (a, b, t) => ({
        size: {
            x: lerpNumber(a.size.x, b.size.x, t),
            y: lerpNumber(a.size.y, b.size.y, t),
        },
        density: lerpNumber(a.density, b.density, t),
        color: [
            lerpNumber(a.color[0], b.color[0], t),
            lerpNumber(a.color[1], b.color[1], t),
            lerpNumber(a.color[2], b.color[2], t),
            lerpNumber(a.color[3], b.color[3], t),
        ],
        opacity: lerpNumber(a.opacity ?? 1, b.opacity ?? 1, t),
    }),
    update: (previous) => previous,
    equals: (a, b) =>
        a.size.x === b.size.x && a.size.y === b.size.y &&
        a.density === b.density &&
        a.color[0] === b.color[0] && a.color[1] === b.color[1] &&
        a.color[2] === b.color[2] && a.color[3] === b.color[3],
};
