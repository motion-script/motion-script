import { resolveFill } from '../fill/registry';
import { FillProp, FillResolved } from '../fill/union';

// ── Prop (loose) ─────────────────────────────────────────────────────────────

export interface ShadowProp {
    blur?: number;
    dx?: number;
    dy?: number;
    /** Any loose fill: a CSS color string, fill prop object, or resolved fill. */
    fill?: FillProp;
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
    fill: FillResolved;
}

// ── Mapper ───────────────────────────────────────────────────────────────────

export function resolveShadow(prop: ShadowProp, previous?: ShadowResolved): ShadowResolved {
    return {
        blur: prop.blur ?? previous?.blur ?? 0,
        dx: prop.dx ?? previous?.dx,
        dy: prop.dy ?? previous?.dy,
        fill: prop.fill != null ? resolveFill(prop.fill) : (previous?.fill ?? resolveFill('transparent')),
    };
}

export function resolveShadowArray(prop: ShadowProp | ShadowProp[] | undefined, previous?: ShadowResolved[]): ShadowResolved[] {
    if (prop == null) return [];
    const arr = Array.isArray(prop) ? prop : [prop];
    return arr.map((p, i) => resolveShadow(p, previous?.[i]));
}
