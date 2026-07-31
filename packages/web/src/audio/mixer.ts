import { sourceTimeAtSceneElapsed } from "@motion-script/core";
import type { AudioMixer, ScheduledAudioRequest } from "@motion-script/skia-render/export";
import {
    applySpeedToPlaybackRate,
    buildAudioFilterGraph,
    effectiveSpeed,
    speedCurveOf,
} from "./filter-graph";

/** Sample rate used when the caller doesn't pick one. */
export const DEFAULT_SAMPLE_RATE = 44100;

export interface MixAudioOptions {
    /** Defaults to {@link DEFAULT_SAMPLE_RATE}. */
    sampleRate?: number;
}

/** Fetches and decodes an audio source against a scratch `OfflineAudioContext` (decoding requires a context but doesn't render through it). */
async function fetchAudioBuffer(src: string, ctx: OfflineAudioContext): Promise<AudioBuffer> {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Render every scheduled request into one timeline-length buffer.
 *
 * An `OfflineAudioContext` graph — gain per request, looping/trimming, and the
 * same filter chain the live {@link WebAudioDevice} builds — rendered in one
 * pass rather than scheduled per frame.
 *
 * Shared by the video exporter and by a standalone `AudioTimeline.mixdown()`,
 * deliberately: a preview and the file it exports have to be the same mix, and
 * two implementations of "stack these clips" would eventually disagree.
 *
 * Curve-valued filter params and `speed` curves schedule here exactly as they do
 * in {@link WebAudioDevice.playBuffer}, which is the reference implementation —
 * the two must be read side by side when either changes.
 *
 * One deliberate difference: this schedules at absolute context times, so clip
 * starts are sample-accurate here and quantized to `1/fps` in live playback,
 * which starts sources at `currentTime` on a clock tick.
 */
export async function mixAudio(
    requests: readonly ScheduledAudioRequest[],
    totalDuration: number,
    options: MixAudioOptions = {},
): Promise<AudioBuffer | null> {
    if (requests.length === 0) return null;
    const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    const frames = Math.ceil(totalDuration * sampleRate);
    if (frames <= 0) return null;

    const uniqueSrcs = [...new Set(requests.map(r => r.request.src))];
    const scratchCtx = new OfflineAudioContext(2, frames, sampleRate);

    const decoded = new Map<string, AudioBuffer>();
    await Promise.all(uniqueSrcs.map(async (src) => {
        decoded.set(src, await fetchAudioBuffer(src, scratchCtx));
    }));

    const mixCtx = new OfflineAudioContext(2, frames, sampleRate);

    for (const { request: req, globalOffset } of requests) {
        const srcBuffer = decoded.get(req.src);
        if (!srcBuffer) continue;

        const globalStart = globalOffset + req.startAt;
        // `endAt` is `Infinity` for an open clip; either way the timeline bounds it.
        const globalEnd = Math.min(globalOffset + req.endAt, totalDuration);
        const playDuration = globalEnd - globalStart;
        if (playDuration <= 0) continue;

        const source = mixCtx.createBufferSource();
        source.buffer = srcBuffer;
        source.loop = req.loop;

        const scalarSpeed = effectiveSpeed(req.filters);
        const rate = Number.isFinite(scalarSpeed) && scalarSpeed > 0 ? scalarSpeed : 1;
        const speedCurve = speedCurveOf(req.filters);
        // With a curve the scalar is folded into the scheduled ramp below, so
        // setting it here as well would apply it twice.
        if (rate !== 1 && !speedCurve) source.playbackRate.value = rate;

        const gain = mixCtx.createGain();
        gain.gain.value = Number.isFinite(req.volume) ? req.volume : 1;

        // The trimmed source length the filter and speed curves are authored over.
        const sourceLength = Math.max(0, srcBuffer.duration - req.trimStart);
        // The clip's own scene-time length — what a curve resolves against.
        // Deliberately *not* `playDuration`, which is that length truncated by the
        // timeline end: resolving against the truncated value would squeeze the
        // whole curve into the surviving part instead of cutting it off.
        const clipDuration = Number.isFinite(req.endAt)
            ? Math.max(0, req.endAt - req.startAt)
            : sourceLength / rate;

        // Filter chain sits between the source and the per-request gain, matching
        // the live WebAudioDevice graph so exports sound identical to preview.
        // Passing the start time and clip duration is what lets curve-valued params
        // schedule — with the defaults they collapse to a single static value.
        // `elapsed` is 0: unlike a live seek, the mix always starts a clip at its
        // own beginning.
        const graph = buildAudioFilterGraph(
            mixCtx, source, req.filters ?? [], globalStart, clipDuration, 0,
        );
        graph.output.connect(gain);
        gain.connect(mixCtx.destination);

        if (speedCurve) {
            applySpeedToPlaybackRate(
                source.playbackRate, speedCurve, sourceLength, clipDuration, rate, globalStart, 0,
            );
        }

        // start()'s 3rd arg is a source-buffer duration. A constant rate scales it
        // linearly, but under a speed curve the buffer consumed over a span of
        // scene time is the integral of the rate, not a multiple of it.
        const consumed = speedCurve
            ? sourceTimeAtSceneElapsed(speedCurve, sourceLength, playDuration)
            : playDuration * rate;

        source.start(globalStart, req.trimStart, consumed);
        for (const osc of graph.oscillators) osc.start(globalStart);
    }

    return mixCtx.startRendering();
}

/** Adapter presenting {@link mixAudio} as the exporter's injected mixer seam. */
export class WebAudioMixer implements AudioMixer<AudioBuffer> {
    mix(
        requests: readonly ScheduledAudioRequest[],
        totalDuration: number,
        sampleRate: number = DEFAULT_SAMPLE_RATE,
    ): Promise<AudioBuffer | null> {
        return mixAudio(requests, totalDuration, { sampleRate });
    }
}

/**
 * Encode an `AudioBuffer` as a 16-bit PCM WAV.
 *
 * The only other encoder in this package is the AAC track inside the mp4 muxer,
 * which is reachable solely by exporting a video — so without this a mixdown has
 * no file representation at all. WAV because it needs no codec support and is
 * lossless; a host wanting mp3/aac can re-encode from here.
 */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
    const channelCount = buffer.numberOfChannels;
    const frameCount = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const dataBytes = frameCount * blockAlign;

    const out = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(out);

    const ascii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    ascii(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);            // PCM header length
    view.setUint16(20, 1, true);             // format: PCM
    view.setUint16(22, channelCount, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 8 * bytesPerSample, true);
    ascii(36, "data");
    view.setUint32(40, dataBytes, true);

    // Pull each channel out once — getChannelData is a live view, but calling it
    // per sample inside the interleave loop is measurably slower.
    const channels: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let frame = 0; frame < frameCount; frame++) {
        for (let c = 0; c < channelCount; c++) {
            // Clamp before scaling: the mix bus can exceed [-1,1] where clips
            // overlap, and letting that wrap turns a loud passage into noise.
            const sample = Math.max(-1, Math.min(1, channels[c][frame]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += bytesPerSample;
        }
    }

    return new Uint8Array(out);
}
