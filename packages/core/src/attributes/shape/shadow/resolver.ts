import { resolveFillArray } from '../fill/registry';
import { FillResolved } from '../fill/union';
import { ChainableFill } from '../fill/chain';

// ── Prop (loose) ─────────────────────────────────────────────────────────────

export interface ShadowProp {
    blur?: number;
    dx?: number;
    dy?: number;
    /** Any loose fill: a CSS color string, fill prop object, resolved fill, or {@link FillChain}/array of layers. */
    fill?: ChainableFill;
    /** When true, the shadow is cast inward (inset) instead of as a drop shadow. Defaults to false. */
    inner?: boolean;
}
/**
 * Fully resolved shadow — all fields normalised with defaults applied.
 * Compatible with the lerp registry (IFill is used for fill to avoid
 * breaking the existing lerp/registry pipeline).
 */
export interface ShadowResolved {
    blur: number;
    dx?: number;
    dy?: number;
    /** Resolved fill layers, painted bottom-to-top like a node's `fill`. */
    fill: FillResolved[];
    /** When true, the shadow is cast inward (inset) instead of as a drop shadow. */
    inner: boolean;
}

// ── Mapper ───────────────────────────────────────────────────────────────────

export function resolveShadow(prop: ShadowProp, previous?: ShadowResolved): ShadowResolved {
    return {
        blur: prop.blur ?? previous?.blur ?? 0,
        dx: prop.dx ?? previous?.dx,
        dy: prop.dy ?? previous?.dy,
        fill: prop.fill != null ? resolveFillArray(prop.fill) : (previous?.fill ?? resolveFillArray('transparent')),
        inner: prop.inner ?? previous?.inner ?? false,
    };
}

export function resolveShadowArray(prop: ShadowProp | ShadowProp[] | undefined, previous?: ShadowResolved[]): ShadowResolved[] {
    if (prop == null) return [];
    const arr = Array.isArray(prop) ? prop : [prop];
    return arr.map((p, i) => resolveShadow(p, previous?.[i]));
}
