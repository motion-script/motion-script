import { Corners, CornersInput, lerpCorners, resolveCorners } from "./per-corner";

/**
 * How a single corner is shaped once it has a non-zero radius:
 * - `'rounded'` — a circular arc;
 * - `'angled'`  — a straight diagonal chamfer cut across the corner.
 */
export type CornerStyle = "rounded" | "angled";

/** Per-corner resolved styles. */
export type CornerStyleResolved = Corners<CornerStyle>;

/**
 * Accepted corner style input for a Rect: a single {@link CornerStyle} applies to
 * all corners; an object overrides corners individually (`{ topLeft, … }`) or by
 * axis (`{ top, bottom }` / `{ left, right }`). An already-resolved value passes
 * through. Unspecified corners fall back to a previous value or `'rounded'` when
 * resolved.
 */
export type RectCornerStyle = CornersInput<CornerStyle> | CornerStyleResolved;

const isStyle = (v: RectCornerStyle): v is CornerStyle => v === "rounded" || v === "angled";

/** Resolves a {@link RectCornerStyle} input into a fully-specified `CornerStyleResolved`. */
export function resolveCornerStyle(value: RectCornerStyle, previous?: CornerStyleResolved): CornerStyleResolved {
    // A resolved value is structurally a full per-corner `CornersInput<CornerStyle>`,
    // so pin T and let resolveCorners re-resolve it idempotently.
    return resolveCorners(value as CornersInput<CornerStyle>, "rounded", previous, isStyle);
}

/**
 * "Interpolates" corner styles by snapping at the midpoint — corner style is a
 * discrete enum, so it switches at `t = 0.5` rather than blending, matching the
 * codebase's convention for discrete properties (see e.g. pixelate effect).
 */
export function lerpCornerStyle(from: CornerStyleResolved, to: CornerStyleResolved, t: number): CornerStyleResolved {
    return lerpCorners(from, to, t, (f, g) => (t < 0.5 ? f : g));
}
