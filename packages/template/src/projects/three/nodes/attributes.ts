/**
 * Mappers, lerps and small maths helpers shared by the 3D nodes in this folder.
 *
 * These exist because a `@property` is only as good as the `mapper`/`tween` it is
 * declared with: the mapper is what turns a loose authored value (a CSS colour
 * string, a partly-filled options bag) into one canonical internal shape, and the
 * tween is what makes `node.to({ … })` interpolate that shape instead of snapping
 * to it at the end of the duration. Core's own attributes are built exactly this
 * way — see `resolveCornerRadius`/`lerpCornerRadius` behind `Rect.cornerRadius`.
 */

import { clamp, parseColor, type Color, type NormalizedColor } from "motion-script";

// ── Colour ───────────────────────────────────────────────────────────────────

/**
 * Mapper: any {@link Color} → a normalized RGBA tuple.
 *
 * Resolving at *write* time rather than at draw time is the point. A tuple can be
 * interpolated channel-by-channel; `"#3B82F6"` and `"oklch(70% 0.2 250)"` cannot,
 * and re-parsing a string per vertex per frame would be wasted work besides. The
 * tuple is still a valid `Color`, so it can be handed straight back to
 * `Graphics3D` with no conversion.
 */
export function resolveColor(value: Color): NormalizedColor {
    return typeof value === "string" ? parseColor(value) : value;
}

/** Tween: per-channel interpolation of two resolved colours. */
export function lerpColor(from: NormalizedColor, to: NormalizedColor, t: number): NormalizedColor {
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        from[3] + (to[3] - from[3]) * t,
    ];
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Interpolate two numbers, tolerating non-finite endpoints.
 *
 * A resolved options bag can legitimately hold `Infinity` (an unset `maxZoom`
 * means "no ceiling"), and the plain form would produce `NaN` from
 * `Infinity + (Infinity - Infinity) * t`. Non-finite endpoints hold `from` and
 * switch at the end instead.
 */
export function lerpFinite(from: number, to: number, t: number): number {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return t < 1 ? from : to;
    return from + (to - from) * t;
}

/**
 * Interpolate a value that indexes geometry — a segment or division count.
 * Rounded, because a fractional count is meaningless to the loops that consume it.
 */
export function lerpCount(from: number, to: number, t: number): number {
    return Math.round(from + (to - from) * t);
}

/**
 * Tween a flag by holding `from` until the tween lands.
 *
 * Booleans have no in-between, and a mid-tween flip reads as a glitch rather than
 * a transition, so the switch happens once at the end.
 */
export function snapFlag(from: boolean, to: boolean, t: number): boolean {
    return t < 1 ? from : to;
}

// ── Camera ───────────────────────────────────────────────────────────────────

/** A camera placement in spherical terms — what `orbit`/`elevation`/`zoom` hold. */
export interface Orbit {
    /** Angle about the Y axis, in **degrees**. */
    orbit: number;
    /** Angle above the ground plane, in **degrees**. 0 is edge-on, 90 straight down. */
    elevation: number;
    /** Distance from the target. */
    distance: number;
}

/**
 * Decompose a raw camera position into {@link Orbit} terms.
 *
 * The forward direction — orbit/elevation/distance back to a position — used to
 * live here too, as `orbitPosition`. It is now the camera's own vocabulary
 * (`Camera3D`'s `orbit`/`elevation`/`distance`, and `resolveCameraPlacement`
 * behind it), so what is left is only the inverse: seeding those three props from
 * an authored `[x, y, z]`.
 *
 * Azimuth is measured from **+Z**, matching core, so 0 is head-on. Getting that
 * wrong is a quarter-turn of silent disagreement between the seed and the
 * placement it seeds.
 */
export function orbitOf(position: { x: number; y: number; z: number }): Orbit {
    const distance = Math.hypot(position.x, position.y, position.z) || 1;
    return {
        orbit: Math.atan2(position.x, position.z) * (180 / Math.PI),
        elevation: Math.asin(clamp(position.y / distance, -1, 1)) * (180 / Math.PI),
        distance,
    };
}

// ── Sampling ─────────────────────────────────────────────────────────────────

/**
 * Make a sampled height safe to put in a vertex buffer.
 *
 * `NaN` (from `sqrt` of a negative, `log` of zero) poisons a whole triangle and
 * leaves a hole; an asymptote produces values large enough to stretch the mesh
 * off-screen and ruin the framing. Both are flattened rather than dropped, so the
 * surface stays continuous.
 */
export function sanitizeHeight(value: number, maxHeight: number): number {
    if (!Number.isFinite(value)) return 0;
    return clamp(value, -maxHeight, maxHeight);
}
