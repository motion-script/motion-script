import { NodeRenderState } from "@/render/render-context";
import { NodeClock } from "./node-clock";
import { Vector2 } from "@/attributes/layout/vector2";

/**
 * Companion for {@link Node}'s clock advance and per-frame motion sampling. The
 * reactive prop reads (x/y/rotation/scale) stay in Node's thin `_sampleMotion`
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
