/**
 * Low-level color interpolation utilities.
 *
 * These helpers operate on {@link NormalizedColor} tuples (linear [R, G, B, A]
 * in the 0–1 range) and are used by fill implementations that need per-channel
 * lerp without pulling in the full fill-registry machinery.
 */

import { NormalizedColor } from "./color/parser";

/** Linearly interpolates two normalized RGBA colors channel-by-channel. */
export function lerpColor(from: NormalizedColor, to: NormalizedColor, t: number): NormalizedColor {
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        from[3] + (to[3] - from[3]) * t,
    ];
}
