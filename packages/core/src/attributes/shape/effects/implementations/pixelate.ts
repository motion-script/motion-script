import { lerpNumber } from "@/tween/lerp";
import type { EffectData } from "../effect-data";

export interface PixelateEffect {
    type: "pixelate";
    /** Horizontal block size in pixels. */
    horizontalBlocks: number;
    /** Vertical block size in pixels. */
    verticalBlocks: number;
}

export const pixelateEffect: EffectData<PixelateEffect> = {
    lerp: (from, to, t) => ({
        type: "pixelate",
        horizontalBlocks: lerpNumber(from.horizontalBlocks, to.horizontalBlocks, t),
        verticalBlocks: lerpNumber(from.verticalBlocks, to.verticalBlocks, t),
    }),
    equals: (a, b) => a.horizontalBlocks === b.horizontalBlocks && a.verticalBlocks === b.verticalBlocks,
};
