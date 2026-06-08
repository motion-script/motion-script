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
export type SizeType = "fill" | "hug";

/** A dimension can be specified as a behavior keyword or a fixed pixel value. */
export type SizeInput = SizeType | number;