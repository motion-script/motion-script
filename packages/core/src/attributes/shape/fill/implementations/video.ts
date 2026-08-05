import type { BlendMode } from '../blend';
import type { MediaFilter, VideoMediaFilter } from '../../filters/union';
import type { PosterizeTimeFilter } from '../../filters/implementations/posterize-time';
import type { FillData } from '../registry';
import type { ImageCrop, ImageFit, ImageMatrix } from './image';
import { lerpImagePlacement, resolveImagePlacement } from './image';
import type { Anchor } from '@/attributes/layout/anchor';
import type { InsetsResolved } from '@/attributes/layout/insets';
import type { Vector2 } from '@/attributes/layout/vector2';
import { lerpNumber } from '@/tween/lerp';
import { lerpOptionalFilters, prepareFilter } from '../../filters/registry';

/** Filters a video fill carries — the pixel filters plus the video-only ones. */
type VideoFillFilter = MediaFilter | VideoMediaFilter;

export interface VideoFillProp {
    type: 'video';
    src: string;
    /** How the (cropped) frame is scaled into the node's bounds. Defaults to `'fill'`. */
    fit?: ImageFit;
    /** Window onto the source frame, applied before `fit`. See {@link ImageCrop}. */
    crop?: ImageCrop;
    /** Magnification on top of the fitted scale. See {@link ImageFillProp.zoom}. */
    zoom?: number;
    /** The point held fixed as `zoom` scales. See {@link ImageFillProp.anchor}. */
    anchor?: Anchor;
    /** Raw frame→shape matrix; wins over everything above. See {@link ImageFillProp.matrix}. */
    matrix?: ImageMatrix;
    /**
     * Source time to paint, in seconds — an **explicit override**. Omit it (the
     * default) and the timestamp is derived at draw time from how long the node
     * painting the fill has existed, so a video fill plays on its own wherever
     * it is used (fill, overlay, stroke, shadow, a raw `Graphics` in a custom
     * node) with nothing to wire up. Set it to drive the playhead yourself —
     * e.g. tween it to scrub the clip.
     *
     * Pass `null` to hand the playhead back to the clock: `Node.set` skips
     * `undefined` values (it merges a partial), so `null` is what un-does an
     * override that is already live.
     */
    timestamp?: number | null;
    /** Whether the derived timestamp advances with the node's clock. Default `true`. */
    playing?: boolean;
    trimStart?: number;
    trimEnd?: number;
    /**
     * Seconds after the painting node appears before playback begins (default
     * `0`). Use it when the fill joins a node that already existed — a video
     * cross-faded in at 4s into a node's life would otherwise open 4s into the
     * clip. Negative values start the clip already in progress.
     */
    playStart?: number;
    speed?: number;
    filters?: VideoFillFilter[];
    loop?: 'forward' | 'reverse' | 'none';
    duration?: number;
    opacity?: number;
    blend?: BlendMode;
}

export interface VideoFillResolved {
    type: 'video';
    src: string;
    fit?: ImageFit;
    crop?: InsetsResolved;
    zoom?: number;
    anchor?: Vector2;
    matrix?: ImageMatrix;
    /** Explicit source time, or `undefined`/`null` to derive it — see {@link VideoFillProp.timestamp}. */
    timestamp?: number | null;
    playing: boolean;
    trimStart?: number;
    trimEnd?: number;
    playStart?: number;
    speed?: number;
    filters?: VideoFillFilter[];
    loop?: 'forward' | 'reverse' | 'none';
    duration?: number;
    opacity?: number;
    blend?: BlendMode;
}

/**
 * The source time a video fill paints at, given `elapsed` — how long the node
 * painting it has existed (`NodeRenderState.elapsed`).
 *
 * A pure function of the fill and the clock, called by the backend as it paints,
 * the same way a motion blur is resolved against the node's sampled velocity.
 * Deriving it at draw time (rather than advancing a stored timestamp each tick)
 * is what lets a video fill play anywhere paint is accepted — stroke, shadow,
 * text selection, a custom node's raw `Graphics` — instead of only on the two
 * nodes that remembered to update it. It also makes frame *N* identical however
 * the playhead reached it, so scrubbing and export agree with playback.
 *
 * `sourceDuration` is the clip's real length in seconds, used to resolve the
 * `trimEnd` default and the loop cycle. Pass `undefined` (or a non-positive
 * value) when it isn't known yet — playback then runs linearly and unlooped,
 * which is what a decoder that hasn't opened the container can honour anyway.
 */
export function resolveVideoTimestamp(
    fill: VideoFillResolved,
    elapsed: number,
    sourceDuration?: number,
): number {
    const start = fill.trimStart ?? 0;
    return posterizeTimestamp(fill, start, rawTimestamp(fill, elapsed, sourceDuration, start));
}

/** {@link resolveVideoTimestamp} before the posterize-time quantization. */
function rawTimestamp(
    fill: VideoFillResolved,
    elapsed: number,
    sourceDuration: number | undefined,
    start: number,
): number {
    // An authored timestamp wins outright: the author is driving the playhead.
    if (fill.timestamp != null) return fill.timestamp;
    // Paused with no authored time: hold the clip's first frame.
    if (!fill.playing) return start;

    const hasDuration = sourceDuration !== undefined && Number.isFinite(sourceDuration) && sourceDuration > 0;
    const end = fill.trimEnd ?? (hasDuration ? sourceDuration : Infinity);
    const played = Math.max(0, elapsed - (fill.playStart ?? 0)) * (fill.speed ?? 1);

    const loop = fill.loop ?? 'none';
    const rawLoopDuration = fill.duration ?? (end !== Infinity ? end - start : undefined);
    const loopDuration = rawLoopDuration !== undefined && rawLoopDuration > 0 ? rawLoopDuration : undefined;
    if (loop !== 'none' && loopDuration !== undefined) {
        const cycle = played % loopDuration;
        if (loop === 'reverse') {
            const ping = Math.floor(played / loopDuration) % 2 === 0;
            return start + (ping ? cycle : loopDuration - cycle);
        }
        return start + cycle;
    }
    const linear = start + played;
    return end !== Infinity ? Math.min(linear, end) : linear;
}

/**
 * Posterize Time: snap the resolved source timestamp to a coarser grid so each
 * frame is held for a full 1/fps interval (the stop-motion look). Done after
 * trim/speed/loop so the quantization lives in source-time space and lines up
 * with the adapter's decoded-frame grid. `floor` (not round) holds a frame for
 * its whole interval, matching After Effects.
 */
function posterizeTimestamp(fill: VideoFillResolved, start: number, timestamp: number): number {
    const posterize = fill.filters?.find(
        (f): f is PosterizeTimeFilter => f.type === 'posterizeTime',
    );
    if (!posterize || posterize.fps <= 0) return timestamp;
    const grid = 1 / posterize.fps;
    return start + Math.floor((timestamp - start) / grid) * grid;
}

export const videoFill: FillData<VideoFillResolved> = {
    // See `imageFill.resolve` for why `crop`/`anchor` are destructured out.
    resolve: ({ crop, anchor, ...prop }: VideoFillProp): VideoFillResolved => ({
        ...prop,
        ...resolveImagePlacement({ crop, anchor }),
        playing: prop.playing ?? true,
    }),
    lerp: (a, b, t) => ({
        src: t < 0.5 ? a.src : b.src,
        fit: a.fit ?? b.fit,
        ...lerpImagePlacement(a, b, t),
        loop: t < 0.5 ? a.loop : b.loop,
        duration: t < 0.5 ? a.duration : b.duration,
        trimStart: t < 0.5 ? a.trimStart : b.trimStart,
        trimEnd: t < 0.5 ? a.trimEnd : b.trimEnd,
        playStart: t < 0.5 ? a.playStart : b.playStart,
        playing: t < 0.5 ? a.playing : b.playing,
        opacity: (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t,
        // Both derived (the common case) stays derived — lerping `?? 0` here
        // would pin the tween's result to an explicit timestamp and freeze the
        // clip for as long as the tween's output is live.
        timestamp: a.timestamp == null && b.timestamp == null
            ? undefined
            : lerpNumber(a.timestamp ?? 0, b.timestamp ?? 0, t),
        speed: lerpNumber(a.speed ?? 1, b.speed ?? 1, t),
        // See the note on `imageFill.lerp` — without this the *from* fill's
        // filters ride the whole tween and snap at the end.
        filters: lerpOptionalFilters(a.filters, b.filters, t),
    }),
    equals: (a, b) => a.src === b.src,
    prepare: (fill, manager, width, height) => {
        manager.requestVideo(fill.src, width, height, fill.trimStart ?? 0, fill.trimEnd);
        for (const filter of fill.filters ?? []) prepareFilter(filter, manager, width, height);
    },
};
