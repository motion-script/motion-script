import type { CornerStyle } from "@motion-script/core";

/** Per-corner geometry inputs shared by every shape that rounds its corners. */
export interface CornerSpec {
    /** Corner radius in pixels (already clamped/scaled by the caller). */
    radius: number;
    /** `'rounded'` (circular arc) or `'angled'` (chamfer). */
    style: CornerStyle;
}

/**
 * The distance from a corner's apex, along each adjacent edge, at which the
 * corner's curve begins. For both a circular arc and a chamfer this is the
 * radius. Callers use it to size the straight edge segments between corners.
 *
 * This applies to right-angle corners (rects), where the edge cut-back distance
 * equals the radius. Shapes with arbitrary vertex angles (polygons) compute the
 * cut-back distance from the angle themselves and pass it to
 * {@link cornerCommandsFromCut}.
 */
export function cornerReach(c: CornerSpec): number {
    return c.radius > 0 ? c.radius : 0;
}

/**
 * SVG path commands for a single right-angle corner (a rect corner), assuming
 * the path has already drawn a line up to the corner's entry point
 * (`apex + d0·radius`). Emits the corner curve/cut and leaves the pen at the exit
 * point (`apex + d1·radius`).
 *
 * `(ax, ay)` is the apex (the sharp-corner vertex). `(d0x, d0y)` is the unit
 * vector along the incoming edge (pointing from the apex back toward where the
 * path came from); `(d1x, d1y)` is the unit vector along the outgoing edge
 * (pointing from the apex toward where the path is going).
 *
 * Returns an empty string for a zero-radius corner (the caller's edge line runs
 * straight to the apex, producing a sharp corner).
 */
export function cornerCommands(
    ax: number, ay: number,
    d0x: number, d0y: number,
    d1x: number, d1y: number,
    c: CornerSpec,
): string {
    if (c.radius <= 0) return "";
    // For a right angle, the cut-back distance equals the radius.
    return cornerCommandsFromCut(ax, ay, d0x, d0y, d1x, d1y, c.radius, c.radius, c.style);
}

/**
 * SVG commands for a corner of arbitrary vertex angle, given the cut-back
 * distance `cut` along each edge (where the corner's curve begins/ends) and the
 * arc `radius` (the circular-arc radius for the rounded case). Used by polygon /
 * polygram vertices, where `cut` and `radius` differ and depend on the vertex
 * angle. The pen is assumed to already be at the entry point `apex + d0·cut`;
 * the commands leave it at the exit point `apex + d1·cut`.
 */
export function cornerCommandsFromCut(
    ax: number, ay: number,
    d0x: number, d0y: number,
    d1x: number, d1y: number,
    cut: number, radius: number,
    style: CornerStyle,
): string {
    const ex = ax + d1x * cut, ey = ay + d1y * cut;

    if (style === "angled") {
        // Chamfer: a straight cut between the two cut-back points.
        return `L ${ex} ${ey}`;
    }

    // Circular arc. The turn direction (cross product sign) selects the SVG
    // sweep flag: a clockwise turn is sweep 1.
    const cross = d0x * d1y - d0y * d1x;
    const sweep = cross < 0 ? 1 : 0;
    return `A ${radius} ${radius} 0 0 ${sweep} ${ex} ${ey}`;
}
