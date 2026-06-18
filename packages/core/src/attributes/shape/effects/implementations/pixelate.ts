import { lerpNumber } from "@/tween/lerp";
import type { BackdropCapable, EffectData } from "../effect-data";

/**
 * After Effects-style Mosaic / pixelate.
 *
 * `horizontalBlocks` / `verticalBlocks` are the *number of blocks* across the
 * node, exactly like AE's Mosaic "Horizontal Blocks" / "Vertical Blocks". A
 * count equal to the node's pixel dimension on that axis leaves the image
 * untouched (one block per pixel); lower counts give larger, coarser blocks.
 * For a 1920×1080 image, `1920, 1080` is pristine and `200, 180` is heavily
 * pixelated.
 *
 * `sharpColors` mirrors AE's "Sharp Colors" checkbox: when `true` each block is
 * a single solid colour with hard edges (nearest-neighbour); when `false` the
 * block colours are smoothly interpolated between centres (linear).
 */
export interface PixelateEffect extends BackdropCapable {
    type: "pixelate";
    /** Number of blocks horizontally (AE "Horizontal Blocks"). */
    horizontalBlocks: number;
    /** Number of blocks vertically (AE "Vertical Blocks"). */
    verticalBlocks: number;
    /** AE "Sharp Colors": solid blocks (true) vs. smoothly blended (false). */
    sharpColors: boolean;
}

export const pixelateEffect: EffectData<PixelateEffect> = {
    lerp: (from, to, t) => ({
        type: "pixelate",
        horizontalBlocks: lerpNumber(from.horizontalBlocks, to.horizontalBlocks, t),
        verticalBlocks: lerpNumber(from.verticalBlocks, to.verticalBlocks, t),
        // Boolean has no in-between — snap at the midpoint.
        sharpColors: t < 0.5 ? from.sharpColors : to.sharpColors,
        backdrop: t < 0.5 ? from.backdrop : to.backdrop,
    }),
    equals: (a, b) =>
        a.horizontalBlocks === b.horizontalBlocks &&
        a.verticalBlocks === b.verticalBlocks &&
        a.sharpColors === b.sharpColors &&
        a.backdrop === b.backdrop,
};
