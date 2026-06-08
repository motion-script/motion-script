import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';

export interface StripeFillProp {
    type: 'stripe';
    gap?: number;
    strokeWidth?: number;
    angle?: number;
    color?: Color;
    opacity?: number;
    blend?: BlendMode;
}

export interface StripeFillResolved {
    type: 'stripe';
    gap?: number;
    strokeWidth?: number;
    angle?: number;
    color?: NormalizedColor;
    opacity?: number;
    blend?: BlendMode;
}

export const stripeFill: FillData<StripeFillResolved> = {
    resolve: (prop: StripeFillProp) => ({
        type: 'stripe',
        gap: prop.gap,
        strokeWidth: prop.strokeWidth,
        angle: prop.angle,
        color: prop.color != null
            ? Array.isArray(prop.color)
                ? (prop.color as NormalizedColor)
                : parseColor(prop.color as string)
            : undefined,
        opacity: prop.opacity,
        blend: prop.blend,
    }),
    lerp: (a, b, t) => ({
        gap: lerpNumber(a.gap ?? 8, b.gap ?? 8, t),
        strokeWidth: lerpNumber(a.strokeWidth ?? 1, b.strokeWidth ?? 1, t),
        angle: lerpNumber(a.angle ?? -45, b.angle ?? -45, t),
        color: a.color && b.color ? [
            lerpNumber(a.color[0], b.color[0], t),
            lerpNumber(a.color[1], b.color[1], t),
            lerpNumber(a.color[2], b.color[2], t),
            lerpNumber(a.color[3], b.color[3], t),
        ] : (a.color ?? b.color),
        opacity: lerpNumber(a.opacity ?? 1, b.opacity ?? 1, t),
    }),
    update: (previous) => previous,
    equals: (a, b) =>
        a.gap === b.gap &&
        a.strokeWidth === b.strokeWidth &&
        a.angle === b.angle &&
        a.color?.[0] === b.color?.[0] && a.color?.[1] === b.color?.[1] &&
        a.color?.[2] === b.color?.[2] && a.color?.[3] === b.color?.[3],
};
