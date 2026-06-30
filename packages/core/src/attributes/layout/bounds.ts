import { Size2D } from "@/attributes/layout/size";
import { Vector2 } from "@/attributes/layout/vector2";

/** Position (x, y) and dimensions (width, height) of a node's bounding box in pixel space. */
/** @internal */
export type BoxBounds = Size2D & Vector2;

/** Axis-aligned bounding box expressed as min/max corners rather than origin + size. */
/** @internal */
export type Extents = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};