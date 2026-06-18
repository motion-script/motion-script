import type { FilterData } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/**
 * Resamples a video fill to a lower frame rate, holding each source frame for a
 * `1 / fps` interval — the "stop-motion" / stutter look (After Effects' Posterize
 * Time). Purely temporal: it changes *which* source timestamp is shown, not the
 * pixels, so it is consumed in the video fill's per-frame `update()` (it never
 * reaches the pixel-filter / `setImageFilter` path). No-op on image fills.
 */
export interface PosterizeTimeFilter {
    type: 'posterizeTime';
    /** Target frame rate the source playhead snaps to, in frames per second. */
    fps: number;
}

export const posterizeTimeFilter: FilterData<PosterizeTimeFilter> = {
    lerp: (from, to, t) => ({ type: "posterizeTime", fps: lerpNumber(from.fps, to.fps, t) }),
    equals: (a, b) => a.fps === b.fps,
};
