import { AudioFilterRegistry } from "../registry";
import { Param, lerpParam, equalsParam } from "../curve";

/**
 * Changes the clip's playback rate. Because Web Audio resamples on rate change,
 * this alters both speed *and* pitch (the classic chipmunk / slow-mo effect) and
 * the clip occupies less/more time on the timeline accordingly.
 *
 * `value` may be a time-varying curve; when it is, the clip's scene-time length is
 * the integral `∫ 1/speed(τ) dτ` rather than a simple division (see
 * `integrateSpeedToSceneTime` in `../curve`).
 */
export interface SpeedFilter {
    type: 'speed';
    /** Playback-rate multiplier. 1 = unchanged, 2 = twice as fast, 0.5 = half speed. May be a time-varying curve. */
    value: Param;
}

AudioFilterRegistry.register<SpeedFilter>("speed", {
    lerp: (from, to, t) => ({ type: "speed", value: lerpParam(from.value, to.value, t) }),
    equals: (a, b) => equalsParam(a.value, b.value),
});
