import {
    AudioBufferSource,
    BufferSource,
    BufferTarget,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input,
    MP4,
    Mp4OutputFormat,
    Output,
    StreamTarget,
    type InputVideoTrack,
    type VideoCodec,
} from "mediabunny";

/**
 * Join encoded MP4 segments end to end, without re-encoding.
 *
 * The point of this is what it *doesn't* do: no decode, no encode, no pixels.
 * Each segment is demuxed to its encoded packets, the packets are re-stamped onto
 * one continuous timeline, and a single muxer writes them into one container. The
 * bytes of every frame survive untouched, so the result is bit-identical to the
 * segments and the whole thing runs at I/O speed rather than encode speed.
 *
 * It exists so an export can be **split across workers**. Rendering a timeline is
 * embarrassingly parallel per scene — each scene's generator is independent — but
 * the output has to be one file, and re-encoding the parts to join them would give
 * back everything the parallelism won (and lose a generation of quality). Joining
 * at the packet level is what makes splitting worth doing.
 *
 * ## What the caller has to guarantee
 *
 * **Every segment must be encoded with an identical configuration** — same codec,
 * same resolution, same bitrate settings. A container carries exactly one decoder
 * configuration for a track, so a segment whose parameter sets differ from the
 * first would be described by a configuration that isn't its own, and decode as
 * garbage from that point on. That is not a theoretical concern: hardware encoders
 * are free to pick different parameter sets for the same nominal settings. This is
 * checked rather than assumed — see {@link ConcatMismatchError} — because the
 * failure is silent corruption rather than an exception.
 *
 * **Every segment must begin with a key frame.** Otherwise its first packets refer
 * back to frames that lived in the previous segment's GOP and no longer precede
 * them. Encoders start with a key frame by default; a caller choosing an explicit
 * `keyFrameInterval` needs it to divide the segment length.
 *
 * Audio is *muxed* here but never *joined*: the segments' own audio is ignored
 * entirely, and a single already-mixed buffer is encoded once across the whole
 * result (see {@link ConcatOptions.audio}). Concatenating separately-encoded AAC
 * would put the encoder's priming delay at every join — a click at each boundary
 * and a track that drifts further out of sync with every one — so the timeline's
 * audio is mixed in one pass by whoever owns the timeline, and arrives here as
 * one buffer.
 */

/** Thrown when segments can't be joined losslessly. Carries which segment disagreed. */
export class ConcatMismatchError extends Error {
    constructor(
        /** Index of the offending segment in the input array. */
        readonly segment: number,
        message: string,
    ) {
        super(message);
        this.name = "ConcatMismatchError";
    }
}

/** One segment's demuxed video track, plus the config that describes it. */
interface Segment {
    track: InputVideoTrack;
    config: VideoDecoderConfig;
    duration: number;
}

/**
 * Two decoder configurations describe the same bitstream.
 *
 * `description` holds the codec's parameter sets (the `avcC` box for H.264) and is
 * the field that actually decides decodability — a differing one is exactly the
 * silent-corruption case. Compared bytewise; the rest are compared by value.
 */
function sameDecoderConfig(a: VideoDecoderConfig, b: VideoDecoderConfig): boolean {
    if (a.codec !== b.codec) return false;
    if (a.codedWidth !== b.codedWidth) return false;
    if (a.codedHeight !== b.codedHeight) return false;

    const da = toBytes(a.description);
    const db = toBytes(b.description);
    if (da === null || db === null) return da === db;
    if (da.length !== db.length) return false;
    for (let i = 0; i < da.length; i++) {
        if (da[i] !== db[i]) return false;
    }
    return true;
}

function toBytes(description: VideoDecoderConfig["description"]): Uint8Array | null {
    if (!description) return null;
    // `description` is a BufferSource: an ArrayBuffer, a SharedArrayBuffer, or any
    // view over one. Views carry an offset into a larger buffer, so they must be
    // narrowed rather than wrapped whole.
    if (ArrayBuffer.isView(description)) {
        return new Uint8Array(description.buffer, description.byteOffset, description.byteLength);
    }
    return new Uint8Array(description);
}

export interface ConcatOptions {
    /**
     * One continuous audio track for the whole joined timeline.
     *
     * Mixed once by the caller (see `mixTimelineAudio`) rather than per segment,
     * and that is not a convenience: separately-encoded AAC carries an encoder
     * priming delay at the head of each piece, so joining them puts a click at
     * every scene boundary and drifts the track further out of sync with each
     * one. One buffer in, one encode, no seams.
     */
    audio?: AudioBuffer | null;
    /** AAC bitrate for that track. Defaults to 192 kbps. */
    audioBitrate?: number;
    /**
     * Write the result out as it is muxed instead of returning it.
     *
     * With this the joined file never exists in memory as one buffer, which is
     * the difference between an export the process can hold and one it can't:
     * a 4× 60fps render is hundreds of megabytes, and the default path costs
     * roughly twice that at the tail once the `Blob` copy is counted.
     *
     * **Chunks carry a byte `position` and do not arrive in file order** — a
     * muxer seeks back to patch atom sizes. A sink that appends will produce a
     * file of exactly the right length whose size fields belong to a different
     * one: unplayable, and indistinguishable from success until it is opened.
     * Honour `position`.
     *
     * `concatVideoSegments` resolves to an empty array when this is used; the
     * bytes went to the sink.
     */
    stream?: WritableStream<{ type: "write"; data: Uint8Array; position: number }>;
}

const DEFAULT_AUDIO_BITRATE = 192_000;

/**
 * Concatenate `segments` (each a complete MP4) into one MP4.
 *
 * Segments are joined in array order. Returns the muxed bytes.
 *
 * @throws {ConcatMismatchError} if a segment carries no video track, or one whose
 *         decoder configuration differs from the first segment's. Callers that can
 *         fall back to a single-threaded export should catch this and do so — the
 *         alternative is shipping a file that decodes into garbage halfway through.
 */
export async function concatVideoSegments(
    segments: Uint8Array[],
    options: ConcatOptions = {},
): Promise<Uint8Array> {
    if (segments.length === 0) throw new Error("concatVideoSegments: no segments");
    // A lone segment is already the finished file — unless a track has to be added
    // to it, or it has to go to a sink, either of which means muxing after all.
    if (segments.length === 1 && !options.audio && !options.stream) return segments[0];

    const opened: Segment[] = [];
    for (let i = 0; i < segments.length; i++) {
        const input = new Input({ source: new BufferSource(segments[i]), formats: [MP4] });
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new ConcatMismatchError(i, `Segment ${i} has no video track.`);
        const config = await track.getDecoderConfig();
        if (!config) throw new ConcatMismatchError(i, `Segment ${i} has no decoder configuration.`);
        if (opened.length > 0 && !sameDecoderConfig(opened[0].config, config)) {
            throw new ConcatMismatchError(
                i,
                `Segment ${i} was encoded differently from segment 0 (${opened[0].config.codec} `
                + `${opened[0].config.codedWidth}x${opened[0].config.codedHeight} vs ${config.codec} `
                + `${config.codedWidth}x${config.codedHeight}); joining them would decode as garbage.`,
            );
        }
        opened.push({ track, config, duration: await track.computeDuration() });
    }

    const target = options.stream
        ? new StreamTarget(options.stream as ConstructorParameters<typeof StreamTarget>[0])
        : new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    // `codec` comes off the track rather than the decoder config: the latter's
    // `codec` is the full codec *string* (`avc1.64001f`), while the source wants
    // the family.
    const source = new EncodedVideoPacketSource(opened[0].track.codec as VideoCodec);
    output.addVideoTrack(source);
    // Declared before `start()` — a muxer fixes its track list up front, so an
    // audio track added later would have nowhere to go.
    const audioSource = options.audio
        ? new AudioBufferSource({
            codec: "aac",
            bitrate: options.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
        })
        : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    let offset = 0;
    for (const segment of opened) {
        // The decoder config is handed over with the first packet of each segment.
        // Only the first one can take effect — a container holds one per track —
        // but they have all been checked equal above, so restating it is harmless
        // and keeps the muxer from having to infer anything.
        let first = true;
        for await (const packet of new EncodedPacketSink(segment.track).packets()) {
            await source.add(
                packet.clone({ timestamp: packet.timestamp + offset }),
                first ? { decoderConfig: segment.config } : undefined,
            );
            first = false;
        }
        // Advance by the segment's own duration rather than by the last packet's
        // end: a packet's `duration` is what the container recorded, and summing
        // those would accumulate rounding into a drift across many segments.
        offset += segment.duration;
    }

    // After the video packets, so the encode overlaps nothing it has to wait on.
    if (audioSource && options.audio) await audioSource.add(options.audio);

    source.close();
    audioSource?.close();
    await output.finalize();

    // A streamed result has already gone to the sink; there is nothing to hand
    // back, and materialising it here would undo the point of streaming.
    if (options.stream) return new Uint8Array(0);

    const buffer = (target as BufferTarget).buffer;
    if (!buffer) throw new Error("concatVideoSegments produced no data");
    return new Uint8Array(buffer);
}
