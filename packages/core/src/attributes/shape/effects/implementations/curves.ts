import { lerpNumber } from "@/tween/lerp";
import type { ModedEffect, EffectData } from "../effect-data";
import type { CurvesChannel } from "../../filters/implementations/curves";

/**
 * Tone curve as a **scene effect** — the same adjustment `ImageFilters.curves`
 * applies to a photo, now available on any node, so a group of shapes or a text
 * block can be graded the same way.
 *
 * Shares its type name, fields and renderer handler with {@link CurvesFilter}
 * (the media-fill filter); the only difference is the `mode` flag every scene
 * effect carries. Keeping them one implementation is deliberate — a curve should
 * not mean two different things depending on what it is attached to.
 */
export interface CurvesEffect extends ModedEffect {
    type: "curves";
    /** Curve control points as `[input, output]` pairs in 0–1. */
    points: [number, number][];
    /** Channel(s) the curve applies to (default `'rgb'`). */
    channel?: CurvesChannel;
}

export const curvesEffect: EffectData<CurvesEffect> = {
    // Mirrors `curvesFilter.lerp`: points move pairwise, the channel hard-cuts
    // because an intermediate channel name is meaningless.
    lerp: (from, to, t) => ({
        type: "curves",
        channel: t < 0.5 ? from.channel : to.channel,
        points: from.points.map(([x, y], i) => {
            const [tx, ty] = to.points[i] ?? [x, y];
            return [lerpNumber(x, tx, t), lerpNumber(y, ty, t)] as [number, number];
        }),
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.channel === b.channel &&
        a.mode === b.mode &&
        a.points.length === b.points.length &&
        a.points.every(([x, y], i) => x === b.points[i]?.[0] && y === b.points[i]?.[1]),
};
