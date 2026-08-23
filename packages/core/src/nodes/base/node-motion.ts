import { NodeRenderState } from "@/render/render-context2d";
import { NodeClock } from "./node-clock";
import { Vector2 } from "@/attributes/layout/vector2";

/**
 * Companion for {@link Node2D}'s clock advance and per-frame motion sampling. The
 * reactive prop reads (x/y/rotation/scale) stay in Node2D's thin `_sampleMotion`
 * wrapper; the backward-difference math lives here as a pure function over the
 * reused scratch state — no per-frame allocation (the {@link MotionHistory}
 * holder is created once per node at construction).
 */

/** Largest frame delta we trust for a velocity estimate (seconds). Larger gaps (scrub/seek) read as "unknown". */
/** @internal */
export const MAX_MOTION_DT = 0.2;

/**
 * Per-node rolling history for the backward-difference velocity estimate.
 * Allocated once with the node (mirrors the reused `_renderState` scratch), then
 * mutated in place by {@link sampleMotion} each frame.
 */
/** @internal */
export interface MotionHistory {
    prevPos: Vector2 | null;
    prevTime: number;
    prevRotation: number;
    prevScale: number;
}

/**
 * Record the current position as the history's previous frame, **without**
 * deriving a velocity from it.
 *
 * The seam a driven scene primes through. A generator scene walks time forward
 * one `dt` at a time, so its history is always the frame before and
 * {@link sampleMotion}'s backward difference is a property of the timeline. A
 * driven scene doesn't walk at all — it jumps straight to whatever frame is
 * asked for — so differencing against "wherever the playhead last was" makes
 * velocity a property of *how the viewer got here*: scrub quickly and a static
 * node smears, hold still on the same frame and it doesn't, step backward and it
 * reads zero. Priming with the position one frame earlier is what makes the
 * answer depend on the frame alone.
 */
/** @internal */
export function primeMotion(
    history: MotionHistory,
    x: number,
    y: number,
    rotation: number,
    scale: number,
    at: number,
): void {
    if (!history.prevPos) history.prevPos = { x, y };
    else { history.prevPos.x = x; history.prevPos.y = y; }
    history.prevTime = at;
    history.prevRotation = rotation;
    history.prevScale = scale;
}

/** Create the zeroed history holder a node keeps for its lifetime. */
/** @internal */
export function createMotionHistory(): MotionHistory {
    return { prevPos: null, prevTime: 0, prevRotation: 0, prevScale: 1 };
}

/** Advance a node's clock to `totalTime`, seeding `creation` on first tick. */
/** @internal */
export function advanceClock(clock: NodeClock, totalTime: number): void {
    if (!clock.initialized) {
        clock.creation = totalTime;
        clock.initialized = true;
    }
    clock.time = totalTime;
    clock.elapsed = totalTime - clock.creation;
}

/**
 * Compute this frame's motion (velocity/direction/speed/angular/scale) into the
 * reused `state` as a backward difference against `history`, then roll the
 * history forward. Velocity is `0`/`{0,0}` when no trustworthy delta exists —
 * the first frame, or after a non-monotonic time jump (only `0 < dt <= MAX` is
 * trusted, so a scrub that resets the clock reads as "unknown" rather than a
 * spurious huge velocity). `x`/`y` are the world position (y-down) the caller
 * resolved from `layoutRect + x` / `layoutRect - y`. Layout-dependent fields
 * (`rects`/`elapsed`) are filled in later by `beforeRender`.
 */
/** @internal */
export function sampleMotion(
    state: NodeRenderState,
    history: MotionHistory,
    x: number,
    y: number,
    rotation: number,
    scale: number,
    now: number,
): void {
    const dt = now - history.prevTime;
    const prev = history.prevPos;
    if (prev && dt > 0 && dt <= MAX_MOTION_DT) {
        const vx = (x - prev.x) / dt;
        const vy = (y - prev.y) / dt;
        state.dt = dt;
        state.velocity.x = vx;
        state.velocity.y = vy;
        state.speed = Math.hypot(vx, vy);
        state.direction = (Math.atan2(vy, vx) * 180) / Math.PI;
        state.angularVelocity = (rotation - history.prevRotation) / dt;
        state.scaleVelocity = (scale - history.prevScale) / dt;
    } else {
        state.dt = 0;
        state.velocity.x = 0;
        state.velocity.y = 0;
        state.speed = 0;
        state.direction = 0;
        state.angularVelocity = 0;
        state.scaleVelocity = 0;
    }

    if (!prev) history.prevPos = { x, y };
    else { prev.x = x; prev.y = y; }
    history.prevTime = now;
    history.prevRotation = rotation;
    history.prevScale = scale;
}
