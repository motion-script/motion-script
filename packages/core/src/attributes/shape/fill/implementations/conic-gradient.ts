import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';
import { lerpVector2, Vector2 } from '@/attributes/layout/vector2';

export interface ConicGradientFillProp {
    type: 'conic-gradient';
    colors: Color[];
    stops?: number[];
    center?: Vector2;
    startAngle?: number;
    opacity?: number;
    blend?: BlendMode;
}

export interface ConicGradientFillResolved {
    type: 'conic-gradient';
    colors: NormalizedColor[];
    stops: number[];
    center: Vector2;
    startAngle?: number;
    opacity?: number;
    blend?: BlendMode;
}

function toNormalized(c: Color): NormalizedColor {
    return Array.isArray(c) ? (c as NormalizedColor) : parseColor(c as string);
}

export const conicGradientFill: FillData<ConicGradientFillResolved> = {
    resolve: (prop: ConicGradientFillProp) => ({
        type: 'conic-gradient',
        colors: prop.colors.map(toNormalized),
        stops: prop.stops ?? prop.colors.map((_, i) => i / Math.max(1, prop.colors.length - 1)),
        center: prop.center ?? { x: 0, y: 0 },
        startAngle: prop.startAngle,
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
        startAngle: lerpNumber(a.startAngle ?? 0, b.startAngle ?? 0, t),
        opacity: lerpNumber(a.opacity ?? 1, b.opacity ?? 1, t),
    }),
    update: (previous) => previous,
    equals: (a, b) =>
        a.center.x === b.center.x && a.center.y === b.center.y &&
        (a.startAngle ?? 0) === (b.startAngle ?? 0) &&
        a.colors.length === b.colors.length &&
        a.colors.every((c, i) => c === b.colors[i]),
};
