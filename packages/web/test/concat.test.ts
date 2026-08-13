import { describe, expect, it } from "vitest";
import {
    BufferSource,
    BufferTarget,
    CanvasSource,
    Input,
    MP4,
    Mp4OutputFormat,
    Output,
    VideoSampleSink,
    canEncodeVideo,
} from "mediabunny";

import { ConcatMismatchError, concatVideoSegments } from "@/concat";

/**
 * Does joining separately-encoded MP4 segments actually produce one playable
 * video, with every frame intact and in the right order?
 *
 * This is the load-bearing question under a split export: rendering a timeline
 * across several workers is only worth doing if the parts can be joined *without*
 * re-encoding, and the way that fails is not an exception. A container carries one
 * decoder configuration per track, so segments whose encoders chose different
 * parameter sets produce a file that muxes cleanly, reports the right duration,
 * and decodes into garbage from the first join onward.
 *
 * So these tests go all the way to pixels. Each segment is a distinct solid
 * colour, and the joined file is decoded frame by frame and sampled — anything
 * short of that (packet counts, durations, "it didn't throw") would pass on a file
 * nobody could watch.
 *
 * Real WebCodecs, in real Chromium, through the same mediabunny path the exporter
 * uses. A fake encoder would be testing the test.
 */

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 10;

/** Encoder settings shared by every segment — see `concatVideoSegments`'s contract. */
const ENCODING = {
    codec: "avc",
    bitrate: 1_000_000,
    // Pinned rather than left to the platform: the whole point is that segments
    // agree, and `no-preference` lets Chromium pick a different encoder per call.
    hardwareAcceleration: "prefer-software",
} as const;

/** Encode `frames` frames of a solid `color` into a standalone MP4. */
async function encodeSolid(
    color: string,
    frames: number,
    overrides: Partial<{ width: number; height: number }> = {},
): Promise<Uint8Array> {
    const canvas = document.createElement("canvas");
    canvas.width = overrides.width ?? WIDTH;
    canvas.height = overrides.height ?? HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new CanvasSource(canvas, ENCODING);
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();

    for (let i = 0; i < frames; i++) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await source.add(i / FPS, 1 / FPS);
    }

    source.close();
    await output.finalize();
    const buffer = target.buffer;
    if (!buffer) throw new Error("encode produced no data");
    return new Uint8Array(buffer);
}

/** Every decoded frame's centre pixel, as `[r, g, b]`, in presentation order. */
async function decodeCentrePixels(bytes: Uint8Array): Promise<number[][]> {
    const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("no video track");

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");

    const pixels: number[][] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
        sample.draw(ctx, 0, 0, WIDTH, HEIGHT);
        const [r, g, b] = ctx.getImageData(WIDTH / 2, HEIGHT / 2, 1, 1).data;
        pixels.push([r, g, b]);
        sample.close();
    }
    return pixels;
}

/** `seconds` of a 440Hz tone — something an AAC encoder can actually chew on. */
function tone(seconds: number): AudioBuffer {
    const rate = 44_100;
    const frames = Math.round(seconds * rate);
    const buffer = new OfflineAudioContext(2, frames, rate).createBuffer(2, frames, rate);
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < frames; i++) {
            data[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5;
        }
    }
    return buffer;
}

/** Roughly equal, to absorb the colour shift a lossy codec applies. */
function near(actual: number[], expected: number[], tolerance = 24): boolean {
    return actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
}

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];

/**
 * Whether this browser can encode what the exporter actually produces.
 *
 * H.264 is not part of Chromium — it depends on the build's proprietary-codec
 * support, and a headless run may have no AVC encoder at all. Rather than fail
 * there (or, worse, quietly re-point the test at a codec the exporter never
 * emits and prove nothing about the real path), the suite stands down.
 *
 * `describe.runIf` needs the answer synchronously, so it is resolved once at
 * module scope — top-level await, which the browser runner supports.
 */
const canEncodeAvc = await canEncodeVideo("avc", {
    width: WIDTH,
    height: HEIGHT,
    bitrate: ENCODING.bitrate,
});

describe.runIf(canEncodeAvc)("concatVideoSegments", () => {
    it("joins segments into one video whose frames are intact and in order", async () => {
        const [red, green] = await Promise.all([
            encodeSolid("#ff0000", 6),
            encodeSolid("#00ff00", 4),
        ]);

        const joined = await concatVideoSegments([red, green]);
        const pixels = await decodeCentrePixels(joined);

        // Every frame survives — nothing dropped at the seam, nothing duplicated.
        expect(pixels).toHaveLength(10);
        // And they are in the right order: the first segment's colour, then the
        // second's. A file whose parameter sets disagreed decodes as garbage right
        // here, which is precisely what a packet-count assertion would miss.
        for (let i = 0; i < 6; i++) {
            expect(near(pixels[i], RED), `frame ${i} should be red, got ${pixels[i]}`).toBe(true);
        }
        for (let i = 6; i < 10; i++) {
            expect(near(pixels[i], GREEN), `frame ${i} should be green, got ${pixels[i]}`).toBe(true);
        }
    });

    it("lays the segments out on one continuous timeline", async () => {
        const [a, b] = await Promise.all([
            encodeSolid("#ff0000", 6),
            encodeSolid("#00ff00", 4),
        ]);

        const joined = await concatVideoSegments([a, b]);
        const input = new Input({ source: new BufferSource(joined), formats: [MP4] });
        const track = await input.getPrimaryVideoTrack();

        // 10 frames at 10fps. Each segment is re-stamped by the running offset, so
        // the second one's timestamps continue rather than restarting at zero —
        // which is the bug that makes a joined file play its first segment twice.
        expect(await track!.computeDuration()).toBeCloseTo(1.0, 1);
    });

    it("scales to more than two segments without drifting", async () => {
        const parts = await Promise.all([
            encodeSolid("#ff0000", 3),
            encodeSolid("#00ff00", 3),
            encodeSolid("#0000ff", 3),
        ]);

        const pixels = await decodeCentrePixels(await concatVideoSegments(parts));

        expect(pixels).toHaveLength(9);
        expect(near(pixels[0], RED)).toBe(true);
        expect(near(pixels[4], GREEN)).toBe(true);
        expect(near(pixels[8], BLUE)).toBe(true);
    });

    it("returns a lone segment untouched rather than remuxing it", async () => {
        const only = await encodeSolid("#ff0000", 3);
        expect(await concatVideoSegments([only])).toBe(only);
    });

    it("muxes one continuous audio track across the join", async () => {
        // Audio for a split export is mixed once over the whole timeline and
        // arrives as a single buffer — never as per-segment tracks, whose AAC
        // priming delay would click at every boundary and drift from there.
        const parts = await Promise.all([
            encodeSolid("#ff0000", 6),
            encodeSolid("#00ff00", 4),
        ]);
        const joined = await concatVideoSegments(parts, { audio: tone(1) });
        const input = new Input({ source: new BufferSource(joined), formats: [MP4] });

        expect(await input.getPrimaryAudioTrack()).not.toBeNull();
        // And the video is untouched by the audio's arrival — same duration, so
        // the join still laid the segments out end to end.
        const video = await input.getPrimaryVideoTrack();
        expect(await video!.computeDuration()).toBeCloseTo(1.0, 1);
    });

    it("still muxes a lone segment when it has audio to gain", async () => {
        // The one-segment fast path hands the input straight back, which would
        // silently drop the track it was asked to add.
        const only = await encodeSolid("#ff0000", 3);
        const joined = await concatVideoSegments([only], { audio: tone(0.3) });

        expect(joined).not.toBe(only);
        const input = new Input({ source: new BufferSource(joined), formats: [MP4] });
        expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    });

    it("streams the result out instead of returning it, honouring positions", async () => {
        // The reason this test exists: a muxer seeks back to patch atom sizes, so
        // its chunks do not arrive in file order. A sink that appended would build
        // a file of exactly the right length whose size fields belong to a
        // different one — unplayable, and indistinguishable from success until
        // someone opens it. So the sink here writes at offsets, like the real one,
        // and the result is compared against the buffered path byte for byte.
        const parts = await Promise.all([
            encodeSolid("#ff0000", 4),
            encodeSolid("#00ff00", 4),
        ]);

        const written: { data: Uint8Array; position: number }[] = [];
        const stream = new WritableStream<{ type: "write"; data: Uint8Array; position: number }>({
            write: (chunk) => {
                written.push({ data: chunk.data.slice(), position: chunk.position });
            },
        });

        const returned = await concatVideoSegments(parts, { stream });
        expect(returned).toHaveLength(0);

        // Reassemble exactly as the file on disk would be.
        const size = written.reduce((max, c) => Math.max(max, c.position + c.data.length), 0);
        const assembled = new Uint8Array(size);
        for (const chunk of written) assembled.set(chunk.data, chunk.position);

        // Deliberately *not* compared byte-for-byte against the buffered path:
        // the two targets lay the container out differently (a buffered muxer can
        // relocate the index once it knows every size; a streaming one cannot),
        // and both are valid MP4s. Byte-equality would be asserting an
        // implementation detail neither side promises.
        //
        // What has to hold is that the file plays — and plays *correctly*, which
        // is what catches a sink that ignored `position`: the bytes would all be
        // present, the length would look right, and the video would not decode.
        const pixels = await decodeCentrePixels(assembled);
        expect(pixels).toHaveLength(8);
        expect(near(pixels[0], RED)).toBe(true);
        expect(near(pixels[7], GREEN)).toBe(true);
    });

    it("writes at least one chunk out of order, which is why position matters", async () => {
        // Guards the assumption the streaming design rests on. If mediabunny ever
        // emitted strictly sequential chunks this would fail, and the positional
        // write path in `save-stream.ts` could be simplified — but until then,
        // appending is a corruption bug waiting to happen.
        const parts = await Promise.all([
            encodeSolid("#ff0000", 4),
            encodeSolid("#00ff00", 4),
        ]);

        let expectedNext = 0;
        let sawSeek = false;
        const stream = new WritableStream<{ type: "write"; data: Uint8Array; position: number }>({
            write: (chunk) => {
                if (chunk.position !== expectedNext) sawSeek = true;
                expectedNext = chunk.position + chunk.data.length;
            },
        });

        await concatVideoSegments(parts, { stream });
        expect(sawSeek).toBe(true);
    });

    it("refuses segments that would decode as garbage, naming the culprit", async () => {
        // Differing resolution is the case that is easy to construct; the check
        // that matters most in practice is the codec `description` (the parameter
        // sets), which `sameDecoderConfig` compares bytewise.
        const [normal, odd] = await Promise.all([
            encodeSolid("#ff0000", 3),
            encodeSolid("#00ff00", 3, { width: 160, height: 90 }),
        ]);

        // Loud, and identifying which segment disagreed, because the alternative
        // is a file that looks fine until someone watches it.
        await expect(concatVideoSegments([normal, odd])).rejects.toBeInstanceOf(
            ConcatMismatchError,
        );
        await expect(concatVideoSegments([normal, odd])).rejects.toMatchObject({ segment: 1 });
    });
});
