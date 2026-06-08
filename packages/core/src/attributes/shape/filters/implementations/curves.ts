import { FilterRegistry } from "../registry";
import { lerpNumber } from "@/tween/lerp";

/** Which color channel(s) a curves adjustment targets. */
export type CurvesChannel = 'rgb' | 'r' | 'g' | 'b' | 'a';

/**
 * Remaps pixel values along a tone curve defined by control points.
 *
 * Points are [input, output] pairs in the [0, 1] range. The renderer
 * interpolates a smooth curve through them. Applies to composite RGB
 * by default; set `channel` to target a single channel.
 */
export interface CurvesFilter {
    type: 'curves';
    /** Curve control points as [input, output] pairs in [0, 1]. */
    points: [number, number][];
    /** Channel(s) to apply the curve to. Default 'rgb'. */
    channel?: CurvesChannel;
}

FilterRegistry.register<CurvesFilter>("curves", {
    // Channel hard-cuts at t=0.5 because interpolating between channel names
    // would produce meaningless intermediate states.
    lerp: (from, to, t) => ({
        type: "curves",
        channel: t < 0.5 ? from.channel : to.channel,
        points: from.points.map(([x, y], i) => {
            const [tx, ty] = to.points[i] ?? [x, y];
            return [lerpNumber(x, tx, t), lerpNumber(y, ty, t)] as [number, number];
        }),
    }),
    equals: (a, b) =>
        a.channel === b.channel &&
        a.points.length === b.points.length &&
        a.points.every(([x, y], i) => x === b.points[i]?.[0] && y === b.points[i]?.[1]),
});
