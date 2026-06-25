import { resolveFillArray } from '../fill/registry';
import { FillResolved } from '../fill/union';
import { Fill } from '../fill/chain';
import { Vector2 } from '@/attributes/layout/vector2';

// ── Prop (loose) ─────────────────────────────────────────────────────────────

export interface ShadowProp {
    blur?: number;
    /** Offset of the shadow from the shape, in px. Defaults to `{ x: 0, y: 0 }`. */
    offset?: Vector2;
    /** Any loose fill: a CSS color string, fill prop object, resolved fill, or {@link FillChain}/array of layers. */
    fill?: Fill;
    /** When true, the shadow is cast inward (inset) instead of as a drop shadow. Defaults to false. */
    inner?: boolean;
    /**
     * Grows (positive) or shrinks (negative) the shadow's silhouette before it
     * is offset and blurred, like CSS `box-shadow` spread. Only honoured for
     * ellipses and rectangles, whose geometry can be resized cleanly; ignored
     * for other shapes. Defaults to 0.
     */
    spread?: number;
}
/**
 * Fully resolved shadow — all fields normalised with defaults applied.
 * Compatible with the lerp registry (IFill is used for fill to avoid
 * breaking the existing lerp/registry pipeline).
 */
export interface ShadowResolved {
    blur: number;
    /** Offset of the shadow from the shape, in px. */
    offset?: Vector2;
    /** Resolved fill layers, painted bottom-to-top like a node's `fill`. */
    fill: FillResolved[];
    /** When true, the shadow is cast inward (inset) instead of as a drop shadow. */
    inner: boolean;
    /** Silhouette grow (positive) / shrink (negative) before blur, in px. Only ellipses and rects honour it. */
    spread: number;
}

/**
 * Accepted shapes for a node's `shadow` prop: a single loose {@link ShadowProp},
 * an array of them (stacked), or an already-resolved {@link ShadowResolved}/array
 * — resolved values pass through `resolveShadow` idempotently, so a node's
 * read-back `shadow` can be assigned straight back.
 */
export type Shadow =
    | ShadowProp
    | ShadowResolved
    | (ShadowProp | ShadowResolved)[];

// ── Mapper ───────────────────────────────────────────────────────────────────

export function resolveShadow(prop: ShadowProp, previous?: ShadowResolved): ShadowResolved {
    return {
        blur: prop.blur ?? previous?.blur ?? 0,
        offset: prop.offset ?? previous?.offset,
        fill: prop.fill != null ? resolveFillArray(prop.fill) : (previous?.fill ?? resolveFillArray('transparent')),
        inner: prop.inner ?? previous?.inner ?? false,
        spread: prop.spread ?? previous?.spread ?? 0,
    };
}

export function resolveShadowArray(prop: Shadow | undefined, previous?: ShadowResolved[]): ShadowResolved[] {
    if (prop == null) return [];
    const arr = Array.isArray(prop) ? prop : [prop];
    return arr.map((p, i) => resolveShadow(p as ShadowProp, previous?.[i]));
}
