import { AudioFilter } from "@motion-script/core";

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
 * Builds the Web Audio graph for a clip's filter chain, returning the node to
 * connect downstream. Shared by live playback ({@link WebAudioDevice}) and
 * offline export (`mixAudio`) so both paths sound identical.
 *
 * Filters apply in array order (index 0 closest to the source). `speed` filters
 * are intentionally ignored here — they're realized via `source.playbackRate`
 * by the caller (and affect timeline scheduling), not as a graph node.
 *
 * Pass the already-created `source` so its `playbackRate` can be set by the
 * caller; this function only wires nodes *after* the source.
 */
export function buildAudioFilterGraph(
    ctx: BaseAudioContext,
    source: AudioNode,
    filters: readonly AudioFilter[],
): AudioFilterGraph {
    const nodes: AudioNode[] = [];
    const oscillators: OscillatorNode[] = [];
    let cursor: AudioNode = source;

    const series = (node: AudioNode): void => {
        cursor.connect(node);
        nodes.push(node);
        cursor = node;
    };

    for (const filter of filters) {
        switch (filter.type) {
            case "gain": {
                const gain = ctx.createGain();
                gain.gain.value = filter.value;
                series(gain);
                break;
            }
            case "highpass":
            case "lowpass": {
                const biquad = ctx.createBiquadFilter();
                biquad.type = filter.type === "highpass" ? "highpass" : "lowpass";
                biquad.frequency.value = filter.frequency;
                if (filter.q !== undefined) biquad.Q.value = filter.q;
                series(biquad);
                break;
            }
            case "tremolo": {
                // Carrier gain whose value is modulated by an LFO. With depth d the
                // gain swings between (1 - d) and 1 around a base of (1 - d/2).
                const depth = Math.max(0, Math.min(1, filter.depth));
                const carrier = ctx.createGain();
                carrier.gain.value = 1 - depth / 2;

                const lfo = ctx.createOscillator();
                lfo.frequency.value = filter.rate;
                const lfoDepth = ctx.createGain();
                lfoDepth.gain.value = depth / 2;
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
                const mix = Math.max(0, Math.min(1, filter.mix ?? 0.5));
                const feedback = Math.max(0, Math.min(0.99, filter.feedback));

                const split = cursor;
                const merge = ctx.createGain();

                const dry = ctx.createGain();
                dry.gain.value = 1 - mix;
                split.connect(dry);
                dry.connect(merge);

                const delay = ctx.createDelay(Math.max(1, filter.delay + 1));
                delay.delayTime.value = filter.delay;
                const feedbackGain = ctx.createGain();
                feedbackGain.gain.value = feedback;
                const wet = ctx.createGain();
                wet.gain.value = mix;

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

/**
 * Net playback-rate multiplier from any `speed` filters in the chain (product of
 * all), defaulting to 1. Mirrors `Sound.effectiveSpeed()` so the renderer applies
 * the same rate the core timeline reserved time for.
 */
export function effectiveSpeed(filters: readonly AudioFilter[] | undefined): number {
    if (!filters) return 1;
    let speed = 1;
    for (const f of filters) {
        if (f.type === "speed" && f.value > 0) speed *= f.value;
    }
    return speed;
}
