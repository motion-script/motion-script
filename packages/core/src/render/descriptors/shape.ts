import { TransformState } from "./transform";
import { AlignKey, Alignment, resolvePivot } from "@/attributes/layout/align";
import { Vector2 } from "@/attributes/layout/vector2";

/**
 * Per-shape descriptor state. Shapes carry geometry and a *local* transform
 * (`rotation`/`scale` baked into the path before it joins the union) but **not**
 * layer effects: effects are applied to the whole drawn union via
 * {@link Graphics.effects}, not per shape. So `ShapeState` omits
 * `TransformState.effects` (which remains for node-level transforms).
 */
export interface ShapeState extends Omit<TransformState, "effects" | "pivot"> {
    start: number;
    end: number;
    /**
     * Pivot for the shape's local rotation/scale. Widened from a `Vector2` to a
     * {@link Alignment} so a shape can pivot about a **named anchor**
     * (`.rect({ pivot: 'topRight' })`) as well as an explicit `Vector2`.
     * `with*Descriptor` normalises it to a `Vector2` (via {@link resolveShapePivot}),
     * so the resolved state the renderer reads always carries a concrete pivot.
     */
    pivot: Alignment;
}

/**
 * Normalise a per-shape `pivot` input to a `Vector2`. Resolves a named anchor
 * (`'topRight'`, …) to its normalised `[-1, 1]` pivot and passes an explicit
 * `Vector2` through. Idempotent — safe to call on already-resolved state — so
 * both `with*Descriptor` and the renderer can call it. Defaults to centre when
 * the pivot is absent.
 */
export function resolveShapePivot(pivot: Alignment | undefined): Vector2 {
    return resolvePivot(pivot ?? { x: 0, y: 0 });
}

// ─── Cardinal-anchor positioning ─────────────────────────────────────────────
// A shape can be positioned by a named anchor instead of its centre `x`/`y`,
// exactly like a node: `.rect({ topRight: { x, y }, width, height })` places the
// rect so its top-right corner lands at that point. The nine names share the node
// `align` vocabulary (`center`, `topLeft`, …). Targets are in the same y-UP author
// space as `x`/`y` (the renderer flips to canvas), so `topRight` is the visually
// top-right corner. Like a node, using an anchor also sets the shape's `pivot` to
// that anchor, so a subsequent per-shape `rotation`/`scale` turns about the pinned
// corner.

/** The cardinal-anchor positioning props a shape descriptor accepts (input-only;
 *  they don't appear on the resolved `*State`). Pass at most one, and not together
 *  with `x`, `y`, or `pivot`. Each value is the y-up point the named anchor lands on. */
export interface ShapeAnchorInput {
    center?: Vector2;
    topLeft?: Vector2;
    topRight?: Vector2;
    bottomLeft?: Vector2;
    bottomRight?: Vector2;
    topCenter?: Vector2;
    bottomCenter?: Vector2;
    centerLeft?: Vector2;
    centerRight?: Vector2;
}

/** The nine anchor keys, in the node `align` vocabulary. */
export const SHAPE_ANCHOR_KEYS: AlignKey[] = [
    "center", "topLeft", "topRight", "bottomLeft", "bottomRight",
    "topCenter", "bottomCenter", "centerLeft", "centerRight",
];

/**
 * Validate a shape descriptor's anchor usage — mirrors `Node.validateAnchorProps`,
 * extended to also reject `x`/`y` (a shape positioned by an anchor cannot also set
 * its centre). Throws if more than one anchor is set, or an anchor is combined with
 * `pivot`, `x`, or `y`. `x`/`y`/`pivot` may freely combine with each other.
 */
export function validateShapeAnchorProps(descriptor: Record<string, unknown>): void {
    const present = SHAPE_ANCHOR_KEYS.filter(k => descriptor[k] !== undefined);
    if (present.length > 1) {
        throw new Error(`Cannot set multiple shape anchor props at once: ${present.join(", ")}`);
    }
    if (present.length === 1) {
        const conflict = (["pivot", "x", "y"] as const).find(k => descriptor[k] !== undefined);
        if (conflict) {
            throw new Error(`Cannot set both shape anchor prop '${present[0]}' and '${conflict}' at the same time`);
        }
    }
}

/**
 * Drop the input-only anchor keys from a descriptor, so a `{ ...descriptor }`
 * spread doesn't leak them onto the resolved `*State` (the resolved x/y/pivot
 * already carry the anchor's effect). Returns a shallow copy without those keys.
 */
export function stripShapeAnchorKeys<T extends object>(descriptor: T): Omit<T, keyof ShapeAnchorInput> {
    const out = { ...descriptor } as Record<string, unknown>;
    for (const k of SHAPE_ANCHOR_KEYS) delete out[k];
    return out as Omit<T, keyof ShapeAnchorInput>;
}

/**
 * Resolve a shape descriptor's positioning into a concrete centre `x`/`y` and
 * `pivot` (all in y-up author space), handling the cardinal-anchor shorthand.
 *
 * When an anchor is present its normalised pivot `a` (in `[-1, 1]`, y-up) is mapped
 * onto the shape's own `width`×`height` box: the centre that lands the named anchor
 * on `target` is `centre = target − a · (size / 2)`, and `pivot` is set to `a`
 * (matching `Node`'s auto-pivot). Otherwise `x`/`y`/`pivot` pass through unchanged —
 * `pivot` alone never repositions the shape here, since this same function re-runs
 * on already-resolved state (`with*Descriptor` is called again from
 * `BaseShape.resolveState`) and re-deriving an offset from an already-resolved
 * `pivot` would double-apply it. The `pivot` + plain `x`/`y` shorthand ({@link
 * resolvePivotPosition}) bakes its offset in exactly once, before this function
 * ever sees the descriptor, precisely to preserve that idempotency.
 *
 * Idempotent in the no-anchor case; safe to call more than once per descriptor
 * resolve. Validates via {@link validateShapeAnchorProps} first.
 */
export function resolveShapeAnchor(
    descriptor: Partial<ShapeState> & ShapeAnchorInput,
    width: number,
    height: number,
): { x: number; y: number; pivot: Alignment } {
    validateShapeAnchorProps(descriptor as Record<string, unknown>);

    const anchorKey = SHAPE_ANCHOR_KEYS.find(k => (descriptor as Record<string, unknown>)[k] !== undefined);
    if (anchorKey) {
        const target = (descriptor as Record<string, Vector2>)[anchorKey];
        const a = resolvePivot(anchorKey); // normalised [-1,1], y-up
        return {
            x: target.x - a.x * (width / 2),
            y: target.y - a.y * (height / 2),
            pivot: a,
        };
    }

    return {
        x: descriptor.x ?? 0,
        y: descriptor.y ?? 0,
        pivot: descriptor.pivot ?? { x: 0, y: 0 },
    };
}

/**
 * Fold a plain `pivot` + `x`/`y` into an equivalent resolved centre, so
 * `{ x, y, pivot: 'topRight' }` lands the top-right corner at `(x, y)` — the same
 * place `{ topRight: { x, y } }` would — instead of `x`/`y` always positioning the
 * centre regardless of `pivot`. Uses the same `centre = target − a · (size / 2)`
 * formula as the anchor shorthand.
 *
 * Must run exactly once, on the raw author-facing descriptor, **before**
 * {@link resolveShapeAnchor} ever sees it (i.e. in `flipPositionY`, not inside
 * `with*Descriptor`, which `BaseShape.resolveState` calls a second time on
 * already-resolved state — re-running this there would double the offset, since
 * the output below is indistinguishable from a plain `x`/`y`/`pivot` descriptor).
 * A no-op when an anchor shorthand is already present (validated downstream) or
 * `pivot` is centre/absent.
 */
export function resolvePivotPosition<T extends Partial<ShapeState> & ShapeAnchorInput>(
    descriptor: T,
    width: number,
    height: number,
): T {
    const anchorKey = SHAPE_ANCHOR_KEYS.find(k => (descriptor as Record<string, unknown>)[k] !== undefined);
    if (anchorKey || descriptor.pivot === undefined) return descriptor;

    const a = resolvePivot(descriptor.pivot); // normalised [-1,1], y-up
    if (a.x === 0 && a.y === 0) return descriptor;

    const target = { x: descriptor.x ?? 0, y: descriptor.y ?? 0 };
    return {
        ...descriptor,
        x: target.x - a.x * (width / 2),
        y: target.y - a.y * (height / 2),
        pivot: a,
    };
}
