import { EaseFunction } from "@/tween/ease/type";
import { linear } from "@/tween/ease/constants";
import { lerpNumber } from "@/tween/lerp";

/**
 * Time-varying automation for a single numeric filter param.
 *
 * A {@link Curve} is a portable, immutable list of {@link CurveSegment}s described
 * in **relative** time (seconds from the clip's start, with the final segment
 * anchored to the clip's end). It references no absolute scene time and no
 * external signal, so the same curve can be applied to any clip of any length:
 *
 * @example
 * const swell = ramp(0, 1, 0.5).hold().ramp(1, 0, 1); // up | auto-hold | down
 * AFX.volume(swell).speed(swell); // reusable across params and clips
 *
 * Segments chain fluently (`ramp().hold().ramp()`) — that *is* sequencing; there
 * is intentionally no `seq`/`par`. Parallelism is just multiple filters in a chain.
 */

/** A single automation segment in relative time. */
export interface CurveSegment {
    /**
     * Start value. `undefined` means "continue from the previous segment's end"
     * (or, for the first segment, the param's natural/current value — see
     * {@link fadeIn}, which leaves `from` resolved to 0 explicitly).
     */
    from?: number;
    /** End value. `undefined` for a hold (stays at the resolved `from`). */
    to?: number;
    /**
     * Length in **seconds**. `undefined` only for a bare {@link hold} that
     * auto-fills the remaining middle of the clip.
     */
    duration?: number;
    /** Segment easing; defaults to {@link linear}. */
    ease?: EaseFunction;
}

/** A segment resolved against a concrete clip duration: absolute relative-time keyframe pair. */
export interface ResolvedSegment {
    /** Segment start, seconds from clip start. */
    startTime: number;
    /** Segment end, seconds from clip start. */
    endTime: number;
    from: number;
    to: number;
    ease: EaseFunction;
    /** True when `ease` is the identity {@link linear} — lets the renderer use a cheap `linearRamp`. */
    isLinear: boolean;
}

/** Portable, immutable, fluent automation curve for one numeric param. */
export class Curve {
    constructor(public readonly segments: readonly CurveSegment[] = []) { }

    /** Append a ramp from `from` to `to` over `duration` seconds. */
    ramp(from: number, to: number, duration: number, opts?: { ease?: EaseFunction }): Curve {
        return new Curve([...this.segments, { from, to, duration, ease: opts?.ease }]);
    }

    /**
     * Append a hold. With `duration` it sustains for that many seconds; bare
     * `hold()` stretches to fill whatever time is left in the middle of the clip
     * (only one auto-fill hold is allowed per curve).
     */
    hold(duration?: number): Curve {
        return new Curve([...this.segments, { duration }]);
    }

    /** Append a fade from 0 up over `duration` seconds, anchored at the clip start. */
    fadeIn(duration: number, opts?: { ease?: EaseFunction }): Curve {
        return new Curve([...this.segments, { from: 0, to: 1, duration, ease: opts?.ease }]);
    }

    /** Append a fade down to 0 over `duration` seconds, anchored to the clip end. */
    fadeOut(duration: number, opts?: { ease?: EaseFunction }): Curve {
        return new Curve([...this.segments, { to: 0, duration, ease: opts?.ease }]);
    }

    /**
     * Resolve relative segments into absolute (clip-relative) keyframes once the
     * clip's duration is known.
     *
     * - Explicit segment durations are summed; a single bare `hold()` absorbs the
     *   leftover `clipDuration - sumOfExplicit` so fade-in/hold/fade-out auto-sizes.
     * - The final segment's end lands exactly at `clipDuration` (end-anchor), which
     *   is what makes `fadeOut` "the last N seconds" without naming an anchor.
     * - If explicit durations exceed `clipDuration`, the schedule is clamped to the
     *   clip (later segments may be squeezed to zero) and a dev warning is logged.
     *
     * @param defaultValue value used for an unresolved first `from` (the param's natural value).
     */
    resolve(clipDuration: number, defaultValue: number): ResolvedSegment[] {
        const segs = this.segments;
        if (segs.length === 0) return [];

        // Guard a non-finite/negative clip length so a degenerate duration can never
        // propagate NaN/Infinity into resolved keyframes (and then into AudioParams).
        const clip = Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : 0;

        // Sum explicit durations; find a single auto-fill hold (duration undefined).
        let explicit = 0;
        let autoFillCount = 0;
        for (const s of segs) {
            if (s.duration === undefined) autoFillCount++;
            else explicit += Math.max(0, s.duration);
        }
        if (autoFillCount > 1 && process.env.NODE_ENV !== "production") {
            console.warn(
                `[motion-script] Curve has ${autoFillCount} auto-fill hold()s; only the first absorbs leftover time, the rest are zero-length.`,
            );
        }
        if (explicit > clip && process.env.NODE_ENV !== "production") {
            console.warn(
                `[motion-script] Curve segments total ${explicit.toFixed(3)}s but the clip is only ${clip.toFixed(3)}s; clamping to the clip.`,
            );
        }

        const slack = Math.max(0, clip - explicit);

        // Where does the slack go so the LAST segment always lands on the clip end?
        // - An explicit auto-fill hold() owns it (its index absorbs `slack`).
        // - Otherwise insert it implicitly just before the final segment, so a
        //   trailing fadeOut/ramp is end-anchored ("the last N seconds") without the
        //   author having to type hold(). With no slack, nothing is inserted.
        const autoFillIndex = autoFillCount > 0
            ? segs.findIndex((s) => s.duration === undefined)
            : (slack > 0 ? segs.length - 1 : -1);

        const out: ResolvedSegment[] = [];
        let cursor = 0;
        let prevValue = defaultValue;

        for (let i = 0; i < segs.length; i++) {
            const s = segs[i];

            // Insert the implicit end-anchoring gap before the final segment.
            if (autoFillCount === 0 && i === autoFillIndex && slack > 0) {
                const gapStart = Math.min(cursor, clip);
                const gapEnd = Math.min(cursor + slack, clip);
                out.push({ startTime: gapStart, endTime: gapEnd, from: prevValue, to: prevValue, ease: linear, isLinear: true });
                cursor += slack;
            }

            let dur: number;
            if (s.duration === undefined) {
                // Only the first auto-fill hold absorbs slack; any extras are zero.
                dur = i === autoFillIndex ? slack : 0;
            } else {
                dur = Math.max(0, s.duration);
            }

            const from = s.from ?? prevValue;
            // `to === undefined` is a hold: stay at `from`.
            const to = s.to ?? from;

            const startTime = Math.min(cursor, clip);
            const endTime = Math.min(cursor + dur, clip);
            const ease = s.ease ?? linear;
            out.push({ startTime, endTime, from, to, ease, isLinear: ease === linear });

            cursor += dur;
            prevValue = to;
        }

        return out;
    }

    /** Sample the curve's value at relative time `t` seconds (for a known clip duration). */
    sampleAt(t: number, clipDuration: number, defaultValue: number): number {
        const resolved = this.resolve(clipDuration, defaultValue);
        if (resolved.length === 0) return defaultValue;
        if (t <= resolved[0].startTime) return resolved[0].from;
        for (const seg of resolved) {
            if (t >= seg.startTime && t <= seg.endTime) {
                const span = seg.endTime - seg.startTime;
                const local = span > 0 ? (t - seg.startTime) / span : 1;
                return lerpNumber(seg.from, seg.to, seg.ease(local));
            }
        }
        return resolved[resolved.length - 1].to;
    }

    /** The curve's value at t=0 — its constant fallback for static contexts. */
    staticValue(defaultValue: number): number {
        const first = this.segments[0];
        return first?.from ?? defaultValue;
    }
}

// ─── Free-function constructors (each returns a one-segment Curve, so they chain) ─

/** A ramp from `from` to `to` over `duration` seconds. */
export function ramp(from: number, to: number, duration: number, opts?: { ease?: EaseFunction }): Curve {
    return new Curve().ramp(from, to, duration, opts);
}

/** A hold; bare `hold()` auto-fills the middle of the clip. */
export function hold(duration?: number): Curve {
    return new Curve().hold(duration);
}

/** A fade from 0 up over `duration` seconds, anchored at the clip start. */
export function fadeIn(duration: number, opts?: { ease?: EaseFunction }): Curve {
    return new Curve().fadeIn(duration, opts);
}

/** A fade down to 0 over `duration` seconds, anchored to the clip end. */
export function fadeOut(duration: number, opts?: { ease?: EaseFunction }): Curve {
    return new Curve().fadeOut(duration, opts);
}

// ─── Param type & helpers ──────────────────────────────────────────────────────

/** A filter param: a constant number, or a time-varying {@link Curve}. */
export type Param = number | Curve;

/** Type guard: is this param a time-varying curve? */
export function isCurve(p: Param | undefined): p is Curve {
    return p instanceof Curve;
}

/**
 * The constant value of a param for static contexts (the number itself, or a
 * curve's t=0 value). Used wherever a single representative number is needed
 * (e.g. timeline math, equality fast paths).
 */
export function staticValue(p: Param, fallback = 0): number {
    return isCurve(p) ? p.staticValue(fallback) : p;
}

/**
 * Deterministic string key for a param, including a curve's full segment shape.
 * Used to detect when a filter param actually changed (so playback re-schedules
 * the source) — two curves with identical segments produce the same key.
 */
export function paramKey(p: Param | undefined): string {
    if (p === undefined) return "_";
    if (!isCurve(p)) return String(p);
    return "c[" + p.segments.map((s) =>
        `${s.from ?? "_"},${s.to ?? "_"},${s.duration ?? "_"},${s.ease?.name ?? "lin"}`,
    ).join(";") + "]";
}

/**
 * Interpolate between two params at progress `t`. Two numbers lerp; if either is
 * a curve, hard-cut at t=0.5 (curve↔curve interpolation is out of scope — this
 * only affects crossfades between two *different* filter chains, which is rare).
 */
export function lerpParam(from: Param, to: Param, t: number): Param {
    if (typeof from === "number" && typeof to === "number") return lerpNumber(from, to, t);
    return t < 0.5 ? from : to;
}

/** Param equality: numeric compare, or reference identity for curves. */
export function equalsParam(a: Param | undefined, b: Param | undefined): boolean {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number") return a === b;
    // Curves: reference identity (portable curves are shared values, not rebuilt
    // per-frame). Structural equality is unnecessary for the equals() fast path.
    return false;
}

// ─── Speed integration (shared by core timeline math and the renderer) ──────────

/** Default sampling step (seconds) for numeric speed integration. */
const INTEGRATION_STEP = 0.001;

/**
 * Scene-time duration consumed by playing the source under a (possibly time-varying)
 * speed curve: `∫₀^upper 1/speed(τ) dτ`.
 *
 * The speed curve is authored over the **full** `sourceLength` (its segment times
 * are seconds from the clip's source start), so it is always resolved against
 * `sourceLength`; `upper` is just the integration bound (defaults to the whole
 * source). A slower instant (speed < 1) consumes *more* scene time. Sampled at
 * {@link INTEGRATION_STEP}; speed is clamped to a tiny positive floor so a
 * zero/negative speed can't blow up the integral.
 *
 * Use this in BOTH the core scene-duration math and the cross-scene end resolution
 * so the timeline reserves exactly the span the renderer plays.
 */
export function integrateSpeedToSceneTime(
    speed: Curve,
    sourceLength: number,
    upper: number = sourceLength,
    step = INTEGRATION_STEP,
): number {
    const end = Math.min(upper, sourceLength);
    if (end <= 0) return 0;
    let sceneTime = 0;
    for (let tau = 0; tau < end; tau += step) {
        const dt = Math.min(step, end - tau);
        const v = Math.max(1e-6, speed.sampleAt(tau + dt / 2, sourceLength, 1));
        sceneTime += dt / v;
    }
    return sceneTime;
}

/**
 * Inverse of {@link integrateSpeedToSceneTime}: the source-time offset reached
 * after `sceneElapsed` seconds of scene time under the speed curve. This is what a
 * mid-clip seek needs to compute the correct buffer offset for a speed-curved clip.
 * The curve is always resolved against the full `sourceLength`.
 */
export function sourceTimeAtSceneElapsed(
    speed: Curve,
    sourceLength: number,
    sceneElapsed: number,
    step = INTEGRATION_STEP,
): number {
    if (sceneElapsed <= 0) return 0;
    let scene = 0;
    let tau = 0;
    while (tau < sourceLength) {
        const dt = Math.min(step, sourceLength - tau);
        const v = Math.max(1e-6, speed.sampleAt(tau + dt / 2, sourceLength, 1));
        const sceneStep = dt / v;
        if (scene + sceneStep >= sceneElapsed) {
            // Linear interpolation within this step for sub-step accuracy.
            const frac = sceneStep > 0 ? (sceneElapsed - scene) / sceneStep : 0;
            return tau + dt * frac;
        }
        scene += sceneStep;
        tau += dt;
    }
    return sourceLength;
}
