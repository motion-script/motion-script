import { Size2D } from "@/attributes/layout/size";
import { Vector2 } from "@/attributes/layout/vector2";

/**
 * An axis-aligned box as an origin plus a size — `{ x, y, width, height }` in
 * pixels. The general shape for "a rectangle somewhere", used for a node's
 * laid-out cell, for the extent of what it draws ({@link Node2D._localBounds}),
 * and anywhere else a positioned box is passed around.
 *
 * What `x`/`y` mean is **not** part of the type: the layout engine's rects are
 * canvas (y-down) and relative to the parent, while a node's own content bounds
 * are y-up and relative to its centre. Each site documents its own space, the
 * same way {@link Vector2} is shared across both conventions.
 */
export type BoxBounds = Size2D & Vector2;

/** Axis-aligned bounding box expressed as min/max corners rather than origin + size. */
/** @internal */
export type Extents = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};