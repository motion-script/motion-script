import { Color, NormalizedColor, parseColor } from '../color/parser';
import type { BlendMode } from '../blend';
import type { FillData } from '../registry';
import { lerpNumber } from '@/tween/lerp';
import { Vector2 } from '@/attributes/layout/vector2';

/**
 * A regular lattice of dots — the ground under a diagram, graph paper, the
 * printed-halftone look, the "canvas" backdrop every design tool draws.
 *
 * Measured in **pixels**, like {@link StripeFillProp} and unlike
 * {@link GridFillProp}: a dot field is a texture, so its pitch should not change
 * when the shape carrying it is resized. That is also what makes `offset` worth
 * having — sliding the lattice is how the field parallaxes, and it is the one
 * piece of geometry a px-space pattern cannot fake by moving the node.
 *
 * Rendered from a shader rather than a baked tile, so `radius` and `spacing`
 * stay exact at fractional values and animating any of them costs a uniform
 * write rather than a texture rebuild.
 */
export interface DotGridFillProp {
    type: 'dotGrid';
    /** Dot radius in px. Larger than half of {@link spacing} makes the dots merge. */
    radius?: number;
    /** Distance between one dot's centre and the next, in px, on both axes. */
    spacing?: number;
    /** Shifts the whole lattice, in px. Tween it to drift the field. */
    offset?: Vector2;
    color?: Color;
    opacity?: number;
    blend?: BlendMode;
}

export interface DotGridFillResolved {
    type: 'dotGrid';
    radius: number;
    spacing: number;
    offset: Vector2;
    color: NormalizedColor;
    opacity?: number;
    blend?: BlendMode;
}

/** A 2px dot every 16px: reads as graph paper at 100% without dominating it. */
const DEFAULT_RADIUS = 2;
const DEFAULT_SPACING = 16;

export const dotGridFill: FillData<DotGridFillResolved> = {
    resolve: (prop: DotGridFillProp) => {
        const raw = prop.color ?? ([0, 0, 0, 1] as NormalizedColor);
        return {
            type: 'dotGrid',
            radius: prop.radius ?? DEFAULT_RADIUS,
            spacing: prop.spacing ?? DEFAULT_SPACING,
            offset: prop.offset ?? { x: 0, y: 0 },
            color: Array.isArray(raw) ? (raw as NormalizedColor) : parseColor(raw as string),
            opacity: prop.opacity,
            blend: prop.blend,
        };
    },
    lerp: (a, b, t) => ({
        radius: lerpNumber(a.radius, b.radius, t),
        spacing: lerpNumber(a.spacing, b.spacing, t),
        offset: {
            x: lerpNumber(a.offset.x, b.offset.x, t),
            y: lerpNumber(a.offset.y, b.offset.y, t),
        },
        color: [
            lerpNumber(a.color[0], b.color[0], t),
            lerpNumber(a.color[1], b.color[1], t),
            lerpNumber(a.color[2], b.color[2], t),
            lerpNumber(a.color[3], b.color[3], t),
        ],
        opacity: lerpNumber(a.opacity ?? 1, b.opacity ?? 1, t),
    }),
    equals: (a, b) =>
        a.radius === b.radius &&
        a.spacing === b.spacing &&
        a.offset.x === b.offset.x && a.offset.y === b.offset.y &&
        a.color[0] === b.color[0] && a.color[1] === b.color[1] &&
        a.color[2] === b.color[2] && a.color[3] === b.color[3],
};
