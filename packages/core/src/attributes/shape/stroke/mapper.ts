import { resolveFillArray } from '@/attributes/shape/fill/registry';
import { FillResolved } from '../fill/union';
import { ChainableFill } from '../fill/chain';

// ── Align ──────────────────────────────────────────────────────────────────

/**
 * Where the stroke sits relative to the shape's edge. Resolves to a number in
 * [-1, 1]: -1 = fully inside the outline, 0 = centered (straddles the edge,
 * half in/half out), +1 = fully outside. Named values map to the endpoints;
 * intermediate numbers bias the stroke partway, like Figma's stroke alignment.
 */
export type StrokeAlign = number | 'inside' | 'center' | 'outside';

/** Resolve a loose `align` prop to a clamped number in [-1, 1]. */
export function resolveStrokeAlign(align: StrokeAlign | undefined, fallback: number): number {
    if (align == null) return fallback;
    if (typeof align === 'number') return Math.max(-1, Math.min(1, align));
    switch (align) {
        case 'inside': return -1;
        case 'center': return 0;
        case 'outside': return 1;
    }
    return fallback;
}

// ── Prop (loose) ─────────────────────────────────────────────────────────────

export interface StrokeProp {
    /** Stroke width in pixels. Defaults to 1. */
    weight?: number;
    /** Any loose fill: a CSS color string, fill prop object, resolved fill, or {@link FillChain}/array of layers. */
    fill?: ChainableFill;
    /** Dash pattern. A single number `n` becomes `[n, n]`. */
    dash?: number | number[];
    dashOffset?: number;
    /**
     * Where the stroke sits relative to the edge: a number in [-1, 1] or one of
     * `'inside'` (-1), `'center'` (0), `'outside'` (1). Defaults to `'inside'`,
     * so the stroke stays within the shape's measured bounds (like a CSS border)
     * rather than leaking half its width outside.
     */
    align?: StrokeAlign;
}

/**
 * Fully resolved stroke — all fields normalised with defaults applied.
 * Compatible with the lerp registry (IFill is used for fill to avoid
 * breaking the existing lerp/registry pipeline).
 */
export interface StrokeResolved {
    weight: number;
    /** Resolved fill layers, painted bottom-to-top like a node's `fill`. */
    fill: FillResolved[];
    dash?: number[];
    dashOffset: number;
    /** Stroke placement in [-1, 1]: -1 inside, 0 center, +1 outside. */
    align: number;
}


// ── Mapper ───────────────────────────────────────────────────────────────────

export function resolveStroke(prop: StrokeProp, previous?: StrokeResolved): StrokeResolved {
    let dash: number[] | undefined;
    if (prop.dash != null) {
        const raw = Array.isArray(prop.dash) ? prop.dash : [prop.dash];
        dash = raw.length === 1 ? [raw[0], raw[0]] : raw;
    } else {
        dash = previous?.dash;
    }
    return {
        weight: prop.weight ?? previous?.weight ?? 1,
        fill: prop.fill != null ? resolveFillArray(prop.fill) : (previous?.fill ?? resolveFillArray('transparent')),
        dash,
        dashOffset: prop.dashOffset ?? previous?.dashOffset ?? 0,
        align: resolveStrokeAlign(prop.align, previous?.align ?? -1),
    };
}

export function resolveStrokeArray(prop: StrokeProp | StrokeProp[] | undefined, previous?: StrokeResolved[]): StrokeResolved[] {
    if (prop == null) return [];
    const arr = Array.isArray(prop) ? prop : [prop];
    return arr.map((p, i) => resolveStroke(p, previous?.[i]));
}

