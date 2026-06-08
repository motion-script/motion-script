import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';
import { lerpVector2, Vector2 } from '@/attributes/layout/vector2';

export interface RadialGradientFillProp {
    type: 'radial-gradient';
    colors: Color[];
    stops?: number[];
    center?: Vector2;
    radius?: number;
    opacity?: number;
    blend?: BlendMode;
}

export interface RadialGradientFillResolved {
    type: 'radial-gradient';
    colors: NormalizedColor[];
    stops: number[];
    center: Vector2;
    radius: number;
    opacity?: number;
    blend?: BlendMode;
}

function toNormalized(c: Color): NormalizedColor {
    return Array.isArray(c) ? (c as NormalizedColor) : parseColor(c as string);
}

export const radialGradientFill: FillData<RadialGradientFillResolved> = {
    resolve: (prop: RadialGradientFillProp) => ({
        type: 'radial-gradient',
        colors: prop.colors.map(toNormalized),
        stops: prop.stops ?? prop.colors.map((_, i) => i / Math.max(1, prop.colors.length - 1)),
        center: prop.center ?? { x: 0, y: 0 },
        radius: prop.radius ?? 100,
        opacity: prop.opacity,
        blend: prop.blend,
    }),
    lerp: (a, b, t) => ({
        colors: a.colors.map((c, i) => {
            const d = b.colors[i] ?? c;
            return [lerpNumber(c[0], d[0], t), lerpNumber(c[1], d[1], t), lerpNumber(c[2], d[2], t), lerpNumber(c[3], d[3], t)] as [number, number, number, number];
        }),
        stops: a.stops.map((s, i) => lerpNumber(s, b.stops[i] ?? s, t)),
        center: lerpVector2(a.center, b.center, t),
        radius: lerpNumber(a.radius, b.radius, t),
        opacity: lerpNumber(a.opacity ?? 1, b.opacity ?? 1, t),
    }),
    update: (previous) => previous,
    equals: (a, b) =>
        a.center.x === b.center.x && a.center.y === b.center.y &&
        a.radius === b.radius &&
        a.colors.length === b.colors.length &&
        a.colors.every((c, i) => c === b.colors[i]),
};
