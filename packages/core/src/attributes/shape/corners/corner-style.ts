import { Corners, CornersInput, lerpCorners, resolveCorners } from "./per-corner";

/**
 * How a corner is shaped once it has a non-zero radius:
 * - `'rounded'` — a circular arc;
 * - `'angled'`  — a straight diagonal chamfer cut across the corner.
 */
export type CornerStyle = "rounded" | "angled";

/** Per-corner resolved styles. */
export type CornerStyleResolved = Corners<CornerStyle>;

/**
 * Accepted corner style input: a single style applies to all corners; an object
 * overrides corners individually (`{ topLeft, … }`) or by axis (`{ top, bottom }`
 * / `{ left, right }`). Unspecified corners fall back to a previous value or
 * `'rounded'` when resolved.
 */
export type CornerStyleProps = CornersInput<CornerStyle>;

const isStyle = (v: CornerStyleProps): v is CornerStyle => v === "rounded" || v === "angled";

/** Resolves `CornerStyleProps` into a fully-specified `CornerStyleResolved`. */
export function resolveCornerStyle(value: CornerStyleProps, previous?: CornerStyleResolved): CornerStyleResolved {
    return resolveCorners(value, "rounded", previous, isStyle);
}

/**
 * "Interpolates" corner styles by snapping at the midpoint — corner style is a
 * discrete enum, so it switches at `t = 0.5` rather than blending, matching the
 * codebase's convention for discrete properties (see e.g. pixelate effect).
 */
export function lerpCornerStyle(from: CornerStyleResolved, to: CornerStyleResolved, t: number): CornerStyleResolved {
    return lerpCorners(from, to, t, (f, g) => (t < 0.5 ? f : g));
}
