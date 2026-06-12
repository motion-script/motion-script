import { AudioFilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/**
 * Changes the clip's playback rate. Because Web Audio resamples on rate change,
 * this alters both speed *and* pitch (the classic chipmunk / slow-mo effect) and
 * the clip occupies less/more time on the timeline accordingly.
 */
export interface SpeedFilter {
    type: 'speed';
    /** Playback-rate multiplier. 1 = unchanged, 2 = twice as fast, 0.5 = half speed. */
    value: number;
}

AudioFilterRegistry.register<SpeedFilter>("speed", {
    lerp: (from, to, t) => ({ type: "speed", value: lerpNumber(from.value, to.value, t) }),
    equals: (a, b) => a.value === b.value,
});
