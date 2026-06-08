/** A 2D point or offset in pixel space. */
export interface Vector2 {
    x: number;
    y: number;
}

/** Linear interpolation between two Vector2 positions. t=0 returns `from`, t=1 returns `to`. */
export function lerpVector2(from: Vector2, to: Vector2, t: number): Vector2 {
    return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
    };
}