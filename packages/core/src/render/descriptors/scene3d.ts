import type { RectCornerRadius } from "@/attributes/shape/corners/corner-radius";
import type { RectCornerStyle } from "@/attributes/shape/corners/corner-style";

/**
 * Where and how a {@link Graphics3D} composites into the 2D scene.
 *
 * The destination is a rect of `width` × `height` **logical** pixels centred on
 * the graphics' local origin — the same space shapes are drawn in — so the node's
 * transform has already placed it. Device-pixel sizing of the 3D buffer is the
 * renderer's business: it derives that from the live canvas matrix (so a scaled
 * parent, a camera zoom, or a 2× export all size correctly), capped by
 * {@link maxPixelRatio}.
 */
export interface Scene3DOpState {
    /** Destination width in logical px. */
    width: number;
    /** Destination height in logical px. */
    height: number;
    /** Rounds the composited rect, to match the node's own corners. */
    cornerRadius?: RectCornerRadius;
    /** How a rounded corner is shaped — `'rounded'` or `'angled'`. */
    cornerStyle?: RectCornerStyle;
    /**
     * Ceiling on the 3D buffer's device-pixel ratio. Default 2.
     *
     * Exists so a high-scale export doesn't allocate a quadratically larger
     * render buffer than the scene needs — a 4× export of a 1080p node would
     * otherwise ask for a 16× buffer.
     */
    maxPixelRatio?: number;
    /** Multisample the 3D pass. Default true. */
    antialias?: boolean;
}
