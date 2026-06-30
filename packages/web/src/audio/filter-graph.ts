import { AudioFilterItem, Param, isCurve, sourceTimeAtSceneElapsed } from "@motion-script/core";

/**
 * Result of building an audio-filter graph for one source.
 *
 * - `output` is the last node in the chain; connect it downstream (e.g. to the
 *   per-request gain node).
 * - `nodes` are every intermediate node, so callers can `disconnect()` them on
 *   teardown.
 * - `oscillators` are LFOs (from `tremolo`) the caller must `start()` — and may
 *   `stop()` — alongside the source, since oscillators need an explicit start.
 */
export interface AudioFilterGraph {
    output: AudioNode;
    nodes: AudioNode[];
    oscillators: OscillatorNode[];
}

/**
 * How many sample points per second to bake an eased curve segment into for
 * `setValueCurveAtTime`. 200/s (≈ every 5ms) is smooth to the ear and cheap.
 */
const CURVE_SAMPLES_PER_SECOND = 200;

/**
 * Apply a (possibly time-varying) {@link Param} to a Web Audio {@link AudioParam}.
 *
 * - **number** → set once (today's behavior; zero scheduling overhead).
 * - **Curve** → resolve against `clipDuration` and schedule each segment:
 *   - linear segments via `setValueAtTime` + `linearRampToValueAtTime`,
 *   - eased segments baked into a `Float32Array` via `setValueCurveAtTime`.
 *
 * `elapsed` (scene-seconds already played when a mid-clip seek starts the source)
 * shifts the schedule back by `elapsed` so "now" reads the curve's value at the
 * clip's *current* position, not its start. A `clamp(v)` hook lets a param keep a
 * valid range (e.g. echo mix 0–1) at every sampled point.
 */
function applyParam(
    ctx: BaseAudioContext,
    audioParam: AudioParam,
    param: Param,
    startTime: number,
    clipDuration: number,
    elapsed: number,
    clamp: (v: number) => number = (v) => v,
): void {
    // Coerce to a finite value before touching an AudioParam — the platform throws
    // on NaN/Infinity. Falls back to the current param value (never undefined here).
    const finite = (v: number): number => {
        const c = clamp(v);
        return Number.isFinite(c) ? c : audioParam.value;
    };

    if (!isCurve(param)) {
        audioParam.value = finite(param);
        return;
    }

    // A non-finite clip length yields no usable schedule; hold the curve's start value.
    if (!Number.isFinite(clipDuration) || clipDuration <= 0) {
        audioParam.value = finite(param.staticValue(audioParam.value));
        return;
    }

    const base = startTime - elapsed; // map curve t=0 to here so seeks line up
    const resolved = param.resolve(clipDuration, audioParam.value);
    if (resolved.length === 0) return;

    // Anchor the starting value at `startTime` (the seek point) so there is no
    // jump from the param's default before the first scheduled segment runs.
    const startValue = param.sampleAt(Math.max(0, elapsed), clipDuration, audioParam.value);
    audioParam.setValueAtTime(finite(startValue), startTime);

    for (const seg of resolved) {
        const segStart = base + seg.startTime;
        const segEnd = base + seg.endTime;
        // Skip segments wholly in the past relative to the seek point, or any with a
        // non-finite boundary (degenerate resolve) that would throw on schedule.
        if (segEnd <= startTime || !Number.isFinite(segStart) || !Number.isFinite(segEnd)) continue;

        const span = seg.endTime - seg.startTime;

        if (span <= 0) {
            audioParam.setValueAtTime(finite(seg.to), Math.max(segStart, startTime));
            continue;
        }

        if (seg.isLinear) {
            audioParam.setValueAtTime(finite(seg.from), Math.max(segStart, startTime));
            audioParam.linearRampToValueAtTime(finite(seg.to), segEnd);
        } else {
            const count = Math.max(2, Math.ceil(span * CURVE_SAMPLES_PER_SECOND));
            const samples = new Float32Array(count);
            for (let i = 0; i < count; i++) {
                const local = i / (count - 1);
                samples[i] = finite(seg.from + (seg.to - seg.from) * seg.ease(local));
            }
            // setValueCurveAtTime can't start in the past; clamp the start forward.
            const curveStart = Math.max(segStart, startTime);
            const curveDur = segEnd - curveStart;
            if (curveDur > 0) audioParam.setValueCurveAtTime(samples, curveStart, curveDur);
        }
    }
}

/**
 * Builds the Web Audio graph for a clip's filter chain, returning the node to
 * connect downstream. Shared by live playback ({@link WebAudioDevice}) and
 * offline export (`mixAudio`) so both paths sound identical.
 *
 * Filters apply in array order (index 0 closest to the source). `speed` filters
 * are intentionally ignored here — they're realized via `source.playbackRate`
 * by the caller (and affect timeline scheduling), not as a graph node.
 *
 * `startTime` is the AudioContext time the source starts; `clipDuration` is the
 * clip's scene-time length; `elapsed` is scene-seconds already played at a mid-clip
 * seek (0 for a clean start). These let curve-valued params schedule and align.
 *
 * Pass the already-created `source` so its `playbackRate` can be set by the
 * caller; this function only wires nodes *after* the source.
 */
export function buildAudioFilterGraph(
    ctx: BaseAudioContext,
    source: AudioNode,
    filters: readonly AudioFilterItem[],
    startTime: number = ctx.currentTime,
    clipDuration: number = 0,
    elapsed: number = 0,
): AudioFilterGraph {
    const nodes: AudioNode[] = [];
    const oscillators: OscillatorNode[] = [];
    let cursor: AudioNode = source;

    const series = (node: AudioNode): void => {
        cursor.connect(node);
        nodes.push(node);
        cursor = node;
    };

    const apply = (p: AudioParam, v: Param, clamp?: (n: number) => number): void =>
        applyParam(ctx, p, v, startTime, clipDuration, elapsed, clamp);

    for (const filter of filters) {
        switch (filter.type) {
            case "gain": {
                const gain = ctx.createGain();
                apply(gain.gain, filter.value);
                series(gain);
                break;
            }
            case "highpass":
            case "lowpass": {
                const biquad = ctx.createBiquadFilter();
                biquad.type = filter.type === "highpass" ? "highpass" : "lowpass";
                apply(biquad.frequency, filter.frequency);
                if (filter.q !== undefined) apply(biquad.Q, filter.q);
                series(biquad);
                break;
            }
            case "tremolo": {
                // Carrier gain whose value is modulated by an LFO. With depth d the
                // carrier base = (1 - d/2) and the LFO swing gain = d/2. The clamp
                // hook applies these transforms whether depth is scalar or a curve.
                const carrier = ctx.createGain();
                const lfo = ctx.createOscillator();
                const lfoDepth = ctx.createGain();

                apply(carrier.gain, filter.depth, (d) => 1 - clamp01(d) / 2);
                apply(lfoDepth.gain, filter.depth, (d) => clamp01(d) / 2);
                apply(lfo.frequency, filter.rate);

                lfo.connect(lfoDepth);
                lfoDepth.connect(carrier.gain);

                nodes.push(lfoDepth);
                oscillators.push(lfo);
                series(carrier);
                break;
            }
            case "echo": {
                // Dry + wet split. The wet path is a delay with feedback; both sum
                // into a merge node that becomes the new cursor.
                const split = cursor;
                const merge = ctx.createGain();

                const dry = ctx.createGain();
                apply(dry.gain, filter.mix ?? 0.5, (m) => 1 - clamp01(m));
                split.connect(dry);
                dry.connect(merge);

                // Delay buffer must accommodate the max delay; size from the static value.
                const maxDelay = staticOf(filter.delay);
                const delay = ctx.createDelay(Math.max(1, maxDelay + 1));
                apply(delay.delayTime, filter.delay);
                const feedbackGain = ctx.createGain();
                apply(feedbackGain.gain, filter.feedback, (f) => Math.max(0, Math.min(0.99, f)));
                const wet = ctx.createGain();
                apply(wet.gain, filter.mix ?? 0.5, (m) => clamp01(m));

                split.connect(delay);
                delay.connect(feedbackGain);
                feedbackGain.connect(delay); // feedback loop
                delay.connect(wet);
                wet.connect(merge);

                nodes.push(dry, delay, feedbackGain, wet, merge);
                cursor = merge;
                break;
            }
            case "speed":
                // Realized via source.playbackRate by the caller; no graph node.
                break;
        }
    }

    return { output: cursor, nodes, oscillators };
}

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

/** The static/representative number of a param (number itself, or curve's t=0 value). */
function staticOf(p: Param): number {
    return isCurve(p) ? p.staticValue(0) : p;
}

/**
 * Net *constant* playback-rate multiplier from any scalar `speed` filters in the
 * chain (product of all), defaulting to 1. Curve-valued speeds contribute 1 here
 * and are scheduled separately by {@link applySpeedToPlaybackRate}. Mirrors
 * `Sound.effectiveSpeed()` so the renderer applies the same rate the core timeline
 * reserved time for.
 */
export function effectiveSpeed(filters: readonly AudioFilterItem[] | undefined): number {
    if (!filters) return 1;
    let speed = 1;
    for (const f of filters) {
        if (f.type === "speed" && !isCurve(f.value) && f.value > 0) speed *= f.value;
    }
    return speed;
}

/** The first curve-valued `speed` filter in the chain, if any. */
export function speedCurveOf(filters: readonly AudioFilterItem[] | undefined) {
    if (!filters) return undefined;
    for (const f of filters) {
        if (f.type === "speed" && isCurve(f.value)) return f.value;
    }
    return undefined;
}

/**
 * Schedule a time-varying speed curve onto an `AudioBufferSourceNode.playbackRate`.
 *
 * The curve is authored over **source time** (rate as a function of how far through
 * the source we've played). `setValueAtTime`/`linearRampToValueAtTime` schedule in
 * **context time**, so we walk scene-time forward in small steps, convert each to a
 * source-time offset via the integral inverse, read the curve there, and lay down a
 * value point at the matching context time. `scalar` folds in any constant speed
 * filters (they scale the whole rate uniformly).
 *
 * `elapsed` is scene-seconds already played at a mid-clip seek, so the schedule
 * starts at the seek point and aligns the playbackRate to the clip's true position.
 */
export function applySpeedToPlaybackRate(
    rate: AudioParam,
    curve: ReturnType<typeof speedCurveOf>,
    sourceLength: number,
    sceneDuration: number,
    scalar: number,
    startTime: number,
    elapsed: number,
): void {
    if (!curve) return;
    const step = 1 / CURVE_SAMPLES_PER_SECOND; // scene-time sampling step
    let scene = Math.max(0, elapsed);
    // Seed the value exactly at the seek point.
    const seedSrc = sourceTimeAtSceneElapsed(curve, sourceLength, scene);
    rate.setValueAtTime(Math.max(1e-4, curve.sampleAt(seedSrc, sourceLength, 1) * scalar), startTime);

    for (let s = scene + step; s <= sceneDuration + step; s += step) {
        const clampedScene = Math.min(s, sceneDuration);
        const srcT = sourceTimeAtSceneElapsed(curve, sourceLength, clampedScene);
        const value = Math.max(1e-4, curve.sampleAt(srcT, sourceLength, 1) * scalar);
        const ctxTime = startTime + (clampedScene - scene);
        rate.linearRampToValueAtTime(value, ctxTime);
        if (clampedScene >= sceneDuration) break;
    }
}
