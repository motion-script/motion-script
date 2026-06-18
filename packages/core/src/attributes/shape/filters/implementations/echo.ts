import type { FilterData } from "../registry";
import type { BlendMode } from "../../fill/blend";
import { lerpNumber } from "@/tween/lerp";

/**
 * Composites the current video frame with a trail of past frames (After Effects'
 * Echo), each delayed by `delay` seconds and faded by a `decay` factor. Needs
 * several decoded frames at once, so — unlike the pixel filters — it is rendered
 * by a dedicated multi-pass path in the video fill renderer rather than the
 * `setImageFilter` chain. Video-only; a no-op on image fills.
 *
 * The trail reaches back `echoes * delay` source seconds; frames outside the
 * adapter's decoded back-window are simply skipped (the trail fills in over the
 * first second of playback after a cold seek).
 */
export interface VideoEchoFilter {
    type: 'echo';
    /** Number of past-frame taps drawn behind the current frame. */
    echoes: number;
    /** Delay between successive taps, in source seconds. */
    delay: number;
    /** Per-tap alpha multiplier; tap `n` is drawn at `decay ** n`. Default 0.5. */
    decay?: number;
    /** Blend mode used to composite the echo taps. Default `'screen'`. */
    blend?: BlendMode;
}

export const echoFilter: FilterData<VideoEchoFilter> = {
    lerp: (from, to, t) => ({
        type: "echo",
        echoes: Math.round(lerpNumber(from.echoes, to.echoes, t)),
        delay: lerpNumber(from.delay, to.delay, t),
        decay: lerpNumber(from.decay ?? 0.5, to.decay ?? 0.5, t),
        // Blend is a discrete enum, so it hard-cuts at the midpoint.
        blend: t < 0.5 ? from.blend : to.blend,
    }),
    equals: (a, b) =>
        a.echoes === b.echoes &&
        a.delay === b.delay &&
        (a.decay ?? 0.5) === (b.decay ?? 0.5) &&
        a.blend === b.blend,
};
