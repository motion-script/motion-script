/** Width and height in pixels. */
export interface Size2D {
    width: number;
    height: number;
}

/**
 * Sizing behavior for a node dimension.
 * - `"fill"`: expand to fill available space from the parent
 * - `"hug"`: shrink to fit the node's own content
 */
/** @internal */
export type SizeType = "fill" | "hug";

/** A dimension can be specified as a behavior keyword or a fixed pixel value. */
/** @internal */
export type SizeInput = SizeType | number;

/**
 * Expand the `size` shorthand into `width`/`height` on a props-like object, in
 * place. `size` is sugar for "the same value on both axes"; explicit `width`/
 * `height` take precedence over it (same precedence as {@link resolvePadding}'s
 * side-vs-shorthand rule), so `{ size: 200, width: 100 }` keeps `width: 100` and
 * only fills in `height: 200`. No-op when `size` is absent. The reactive-binding
 * form (`size: () => SizeInput`) is supported — both axes are bound to the same
 * callback, re-evaluated independently per axis.
 */
/** @internal */
export function expandSize(props: Record<string, unknown>): void {
    if (props.size === undefined) return;
    if (props.width === undefined) props.width = props.size;
    if (props.height === undefined) props.height = props.size;
}