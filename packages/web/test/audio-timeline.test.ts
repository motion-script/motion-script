import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { AudioFilters, fadeOut, ramp, type AssetManifest, type AudioTrack } from "@motion-script/core";
import { AudioTimeline, createAudioTimeline } from "../src/audio/timeline";
import { encodeWav } from "../src/audio/mixer";

/**
 * Stacked audio on a timeline, with nothing rendered.
 *
 * The engine could already do this, but only inside a project: beds were resolved
 * during the scene precomp and clipped to a duration the scenes decided, so a set
 * of tracks with no scenes resolved to silence. These pin the standalone path —
 * that a duration is derived from the tracks themselves, and that the mixdown
 * actually stacks overlapping clips rather than picking one.
 *
 * Sources are generated in-page and served as blob URLs, so the suite needs no
 * fixture files and no network. `mixdown` is offline, so it needs no user gesture
 * and is deterministic — unlike `play()`, which a headless browser will not start
 * without one and which is therefore not exercised here.
 */

const SAMPLE_RATE = 44100;

/** A constant-amplitude mono tone, as a WAV blob URL, plus its manifest entry. */
function makeTone(seconds: number, amplitude: number): { src: string; duration: number } {
    const frames = Math.round(seconds * SAMPLE_RATE);
    const ctx = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const buffer = ctx.createBuffer(1, frames, SAMPLE_RATE);
    buffer.getChannelData(0).fill(amplitude);
    const url = URL.createObjectURL(new Blob([encodeWav(buffer)], { type: "audio/wav" }));
    return { src: url, duration: seconds };
}

function manifestOf(...clips: { src: string; duration: number }[]): AssetManifest {
    const audio: AssetManifest["audio"] = {};
    for (const clip of clips) {
        audio[clip.src] = { src: clip.src, duration: clip.duration, sizeBytes: 0 };
    }
    return { image: {}, video: {}, audio, font: {} };
}

/** Peak absolute sample across both channels of a mixed buffer, over a window. */
function peakBetween(buffer: AudioBuffer, from: number, to: number): number {
    const start = Math.floor(from * buffer.sampleRate);
    const end = Math.min(Math.floor(to * buffer.sampleRate), buffer.length);
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    return peak;
}

let half: { src: string; duration: number };
let quarter: { src: string; duration: number };
let timeline: AudioTimeline | undefined;

beforeAll(() => {
    half = makeTone(2, 0.5);
    quarter = makeTone(2, 0.25);
});

afterEach(() => {
    timeline?.dispose();
    timeline = undefined;
});

describe("AudioTimeline", () => {
    it("derives its duration from the tracks, with no scenes involved", () => {
        timeline = new AudioTimeline({
            tracks: [{ src: half.src }, { src: quarter.src, startAt: 3 }],
            manifest: manifestOf(half, quarter),
        });

        // Clips stack rather than queue: the second starts at 3 and runs 2s.
        expect(timeline.duration).toBe(5);
        expect(timeline.errors).toEqual([]);
    });

    it("honours an explicit duration, which looping tracks need", () => {
        timeline = new AudioTimeline({
            tracks: [{ src: half.src, loop: true }],
            manifest: manifestOf(half),
            duration: 7,
        });

        expect(timeline.duration).toBe(7);
        expect(timeline.waveforms()).toEqual([{ src: half.src, startTime: 0, endTime: 7 }]);
    });

    it("exposes the resolved clips for a host to draw", () => {
        timeline = new AudioTimeline({
            tracks: [{ src: half.src, startAt: 1, trimStart: 0.5, trimEnd: 1.5 }],
            manifest: manifestOf(half),
        });

        expect(timeline.waveforms()).toEqual([{ src: half.src, startTime: 1, endTime: 2 }]);
    });

    it("reports an unresolvable track instead of throwing", () => {
        timeline = new AudioTimeline({
            tracks: [{ src: "missing.mp3" }, { src: half.src }],
            manifest: manifestOf(half),
        });

        expect(timeline.errors).toHaveLength(1);
        expect(timeline.waveforms()).toHaveLength(1);
        expect(timeline.duration).toBe(2);
    });

    it("mixes overlapping clips into one buffer, summing where they overlap", async () => {
        const tracks: AudioTrack[] = [
            { src: half.src, startAt: 0 },      // 0.5 over [0, 2)
            { src: quarter.src, startAt: 1 },   // 0.25 over [1, 3)
        ];
        timeline = await createAudioTimeline({ tracks, manifest: manifestOf(half, quarter) });

        expect(timeline.duration).toBe(3);
        const mixed = await timeline.mixdown();

        expect(mixed.sampleRate).toBe(SAMPLE_RATE);
        expect(mixed.length).toBe(Math.ceil(3 * SAMPLE_RATE));
        // Only the first clip, then both summed, then only the second.
        expect(peakBetween(mixed, 0.2, 0.8)).toBeCloseTo(0.5, 2);
        expect(peakBetween(mixed, 1.2, 1.8)).toBeCloseTo(0.75, 2);
        expect(peakBetween(mixed, 2.2, 2.8)).toBeCloseTo(0.25, 2);
    });

    it("applies a track's volume in the mix", async () => {
        timeline = await createAudioTimeline({
            tracks: [{ src: half.src, volume: 0.5 }],
            manifest: manifestOf(half),
        });

        const mixed = await timeline.mixdown();
        expect(peakBetween(mixed, 0.2, 1.8)).toBeCloseTo(0.25, 2);
    });

    it("encodes a mixdown as WAV bytes", async () => {
        timeline = await createAudioTimeline({
            tracks: [{ src: half.src }],
            manifest: manifestOf(half),
        });

        const wav = await timeline.mixdown({ as: "wav" });

        expect(wav).toBeInstanceOf(Uint8Array);
        // A real RIFF/WAVE header, decodable by the platform.
        expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
        expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");

        const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE)
            .decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer);
        expect(decoded.duration).toBeCloseTo(2, 1);
    });

    it("re-resolves when the tracks are replaced", async () => {
        timeline = await createAudioTimeline({
            tracks: [{ src: half.src }],
            manifest: manifestOf(half, quarter),
        });
        expect(timeline.duration).toBe(2);

        await timeline.setTracks([{ src: quarter.src, startAt: 4 }]);

        expect(timeline.duration).toBe(6);
        expect(timeline.waveforms()).toEqual([{ src: quarter.src, startTime: 4, endTime: 6 }]);
    });

    it("refuses to mix a timeline with nothing audible", async () => {
        timeline = new AudioTimeline({ tracks: [], manifest: manifestOf() });
        await expect(timeline.mixdown()).rejects.toThrow(/no audible clips/);
    });

    it("refuses to act after dispose", async () => {
        timeline = new AudioTimeline({ tracks: [{ src: half.src }], manifest: manifestOf(half) });
        timeline.dispose();
        await expect(timeline.mixdown()).rejects.toThrow(/disposed/);
    });
});

describe("mixAudio – curve-valued filters", () => {
    /**
     * These pin the mixdown against the live device, which has always scheduled
     * curves correctly. The mixer used to call `buildAudioFilterGraph` with the
     * default `clipDuration` of 0, which collapses every curve to a single static
     * value, and to read only `effectiveSpeed` — so a fade exported as a constant
     * and a speed curve did nothing at all.
     */

    it("schedules a gain curve across the clip instead of freezing it", async () => {
        timeline = await createAudioTimeline({
            tracks: [{ src: half.src, filters: AudioFilters.gain(ramp(0, 1, 2)) }],
            manifest: manifestOf(half),
        });

        const mixed = await timeline.mixdown();

        // A 0→1 ramp over the clip's 2s, against a constant 0.5 source.
        const start = peakBetween(mixed, 0, 0.1);
        const middle = peakBetween(mixed, 0.95, 1.05);
        const end = peakBetween(mixed, 1.9, 2.0);

        expect(start).toBeLessThan(0.1);
        expect(middle).toBeCloseTo(0.25, 1);
        expect(end).toBeGreaterThan(0.45);
        // The bug's signature: every window identical, because the curve resolved
        // to one static value.
        expect(end).toBeGreaterThan(start + 0.4);
    });

    it("applies a fadeOut anchored to the clip end", async () => {
        timeline = await createAudioTimeline({
            tracks: [{ src: half.src, filters: AudioFilters.gain(fadeOut(1)) }],
            manifest: manifestOf(half),
        });

        const mixed = await timeline.mixdown();

        // Full level through the first second, then down to silence by the end.
        expect(peakBetween(mixed, 0.2, 0.8)).toBeCloseTo(0.5, 1);
        expect(peakBetween(mixed, 1.95, 2.0)).toBeLessThan(0.1);
    });

    it("honours a speed curve, which used to be dropped entirely", async () => {
        // A source whose amplitude ramps 0→1 over 2s, so *where* the playhead is
        // in the source is readable from the output level.
        const frames = 2 * SAMPLE_RATE;
        const ctx = new OfflineAudioContext(1, frames, SAMPLE_RATE);
        const buffer = ctx.createBuffer(1, frames, SAMPLE_RATE);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = i / (frames - 1);
        const swept = {
            src: URL.createObjectURL(new Blob([encodeWav(buffer)], { type: "audio/wav" })),
            duration: 2,
        };

        timeline = await createAudioTimeline({
            // Ramp the rate 2× → 0.5×: the source is consumed fast at first, so by
            // mid-clip the playhead is already deep into the (louder) tail.
            tracks: [{ src: swept.src, filters: AudioFilters.speed(ramp(2, 0.5, 2)) }],
            manifest: manifestOf(swept),
        });

        const mixed = await timeline.mixdown();

        // At 0.5s a constant 1× rate would be ~0.25 through the source; starting at
        // 2× puts it well past that.
        expect(peakBetween(mixed, 0.45, 0.55)).toBeGreaterThan(0.4);
    });
});

describe("encodeWav", () => {
    it("round-trips samples through the platform decoder", async () => {
        const frames = SAMPLE_RATE / 10;
        const source = new OfflineAudioContext(2, frames, SAMPLE_RATE).createBuffer(2, frames, SAMPLE_RATE);
        source.getChannelData(0).fill(0.5);
        source.getChannelData(1).fill(-0.5);

        const bytes = encodeWav(source);
        const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE)
            .decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

        expect(decoded.numberOfChannels).toBe(2);
        expect(decoded.length).toBe(frames);
        // 16-bit quantization, so exactness is not on the table.
        expect(decoded.getChannelData(0)[100]).toBeCloseTo(0.5, 3);
        expect(decoded.getChannelData(1)[100]).toBeCloseTo(-0.5, 3);
    });

    it("clamps rather than wraps where a mix exceeds full scale", () => {
        const source = new OfflineAudioContext(1, 4, SAMPLE_RATE).createBuffer(1, 4, SAMPLE_RATE);
        source.getChannelData(0).set([2, -2, 0, 0]);

        const view = new DataView(encodeWav(source).buffer);
        // Full-scale positive and negative, not a wrapped sign flip.
        expect(view.getInt16(44, true)).toBe(32767);
        expect(view.getInt16(46, true)).toBe(-32768);
    });
});
