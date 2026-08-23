import { Anchor } from "@/attributes/layout/anchor";

/**
 * The out-of-plane transform as one bag — the shorthand form of the individual
 * `rotationX` / `rotationY` / `depth` / `perspective` / `backfaceVisible` /
 * `flipHorizontal` / `flipVertical` / `transformOrigin` props on {@link Node2D}.
 *
 * Sugar, and only sugar: {@link expandTransform3D} writes each field onto the
 * prop it names before anything reads either, the same way `size` becomes
 * `width`/`height`. That keeps one storage location per value — so a tween of
 * `transform3D.rotationY` and a tween of `rotationY` are the same tween, and a
 * scene can mix the two forms without either shadowing the other.
 *
 * Named `NodeTransform3D` rather than `Transform3D`, which `render3d` already
 * uses for the placement of an object in a *real* 3D scene. These are two
 * different things and the names had to say so: this one tilts a flat node the
 * way a browser tilts a `<div>`, that one puts a mesh in a world with lights in it.
 */
export interface NodeTransform3D {
    /** Tilt about the horizontal axis, degrees. Positive tips the top away. */
    rotationX?: number;
    /** Tilt about the vertical axis, degrees. Positive swings the right edge away. */
    rotationY?: number;
    /** In-plane rotation belonging to the 3D block, degrees. Separate from the node's own `rotation`. */
    rotationZ?: number;
    /** Push along the view axis in px (CSS `translateZ`). Inert without `perspective`. */
    depth?: number;
    /** Viewer distance in px. `0` (default) is a parallel projection — no perspective. */
    perspective?: number;
    /** Whether the node still paints once it has turned past edge-on. Default `true`. */
    backfaceVisible?: boolean;
    /** Mirror across the vertical centre line (CSS `scaleX(-1)`). */
    flipHorizontal?: boolean;
    /** Mirror across the horizontal centre line (CSS `scaleY(-1)`). */
    flipVertical?: boolean;
    /** The point the whole transform turns about — CSS `transform-origin`. Defaults to the node's `pivot`. */
    origin?: Anchor;
}

/** The prop each {@link NodeTransform3D} field expands to. `origin` is the one rename. */
const TRANSFORM_3D_KEYS: ReadonlyArray<[keyof NodeTransform3D, string]> = [
    ["rotationX", "rotationX"],
    ["rotationY", "rotationY"],
    ["rotationZ", "rotationZ"],
    ["depth", "depth"],
    ["perspective", "perspective"],
    ["backfaceVisible", "backfaceVisible"],
    ["flipHorizontal", "flipHorizontal"],
    ["flipVertical", "flipVertical"],
    ["origin", "transformOrigin"],
];

/**
 * Expand the `transform3D` shorthand onto the individual props, in place. An
 * explicitly-named prop in the same object wins over the bag's field, matching
 * `size`-vs-`width` and `padding`-vs-`paddingLeft`; a `transform3D` given as a
 * whole-bag callback is left alone, since there is no per-field value to
 * distribute. No-op when the key is absent, which is nearly always.
 */
/** @internal */
export function expandTransform3D(props: Record<string, unknown>): void {
    const bag = props.transform3D;
    if (bag === undefined || bag === null || typeof bag !== "object") return;
    const source = bag as Record<string, unknown>;
    for (const [field, prop] of TRANSFORM_3D_KEYS) {
        const value = source[field];
        if (value !== undefined && props[prop] === undefined) props[prop] = value;
    }
}
