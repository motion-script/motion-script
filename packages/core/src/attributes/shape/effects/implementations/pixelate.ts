import { lerpVector2, Vector2 } from "@/attributes/layout/vector2";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * After Effects-style Mosaic / pixelate.
 *
 * `blocks` is the *number of blocks* across the node on each axis, exactly like
 * AE's Mosaic "Horizontal Blocks" / "Vertical Blocks". A count equal to the
 * node's pixel dimension on that axis leaves the image untouched (one block per
 * pixel); lower counts give larger, coarser blocks. For a 1920×1080 image,
 * `{ x: 1920, y: 1080 }` is pristine and `{ x: 200, y: 180 }` is heavily
 * pixelated.
 *
 * `sharpColors` mirrors AE's "Sharp Colors" checkbox: when `true` each block is
 * a single solid colour with hard edges (nearest-neighbour); when `false` the
 * block colours are smoothly interpolated between centres (linear).
 */
export interface PixelateEffect extends ModedEffect {
    type: "pixelate";
    /** Block count per axis — `x` horizontal, `y` vertical. */
    blocks: Vector2;
    /** AE "Sharp Colors": solid blocks (true) vs. smoothly blended (false). */
    sharpColors: boolean;
}

export const pixelateEffect: EffectData<PixelateEffect> = {
    lerp: (from, to, t) => ({
        type: "pixelate",
        blocks: lerpVector2(from.blocks, to.blocks, t),
        // Boolean has no in-between — snap at the midpoint.
        sharpColors: t < 0.5 ? from.sharpColors : to.sharpColors,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.blocks.x === b.blocks.x &&
        a.blocks.y === b.blocks.y &&
        a.sharpColors === b.sharpColors &&
        a.mode === b.mode,
};
