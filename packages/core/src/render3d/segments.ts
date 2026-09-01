/**
 * Subdivision counts, as one name.
 *
 * three spells this ten different ways — `widthSegments`, `heightSegments`,
 * `depthSegments`, `radialSegments`, `tubularSegments`, `thetaSegments`,
 * `phiSegments`, `capSegments`, `curveSegments`, `detail` — and which one a given
 * shape wants is a thing an author has to look up every time. Every geometry here
 * takes one {@link Segments3D} instead, and the per-axis meaning is documented on
 * the shape rather than encoded in a name.
 *
 * A scalar applies to every axis, which is what you want when you are just
 * turning the resolution up. A tuple is per-axis, in the order the shape's own
 * docs give.
 */
export type Segments3D =
    | number
    | readonly [number]
    | readonly [number, number]
    | readonly [number, number, number];

/**
 * Resolve a {@link Segments3D} against a shape's per-axis defaults.
 *
 * A scalar broadcasts, a tuple fills what it names and leaves the rest at the
 * default, and `undefined` is entirely defaults — so an unset `segments` never
 * pins a shape to a resolution invented at a call site.
 *
 * Values are floored and clamped to at least 1, because a fractional or zero
 * subdivision count reaches three as a degenerate geometry rather than as an
 * error.
 */
export function segmentsOf(
    value: Segments3D | undefined,
    defaults: readonly number[],
): number[] {
    if (value === undefined) return defaults.map(clampSegment);
    if (typeof value === "number") return defaults.map(() => clampSegment(value));
    return defaults.map((fallback, index) => clampSegment(value[index] ?? fallback));
}

function clampSegment(value: number): number {
    return Math.max(1, Math.floor(value));
}
