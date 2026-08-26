import { RenderContext2D } from "@/render/render-context2d";
import { Graphics2D } from "@/render/graphics2d";
import { VideoAdjustment, resolveChainAdjustments } from "@/attributes/shape/filters/chain";
import { lerpFilterArray } from "@/attributes/shape/filters/registry";
import { MediaAdjustment, VideoOnlyAdjustment } from "@/attributes/shape/filters/union";
import { ImageCrop, ImageFit, ImageMatrix } from "@/attributes/shape/fill/implementations/image";
import { Anchor } from "@/attributes/layout/anchor";
import { InsetsResolved } from "@/attributes/layout/insets";
import { Vector2 } from "@/attributes/layout/vector2";
import { anchorProperty, insetsProperty } from "@/attributes/properties/typed";
import { VideoFillProp, VideoFillResolved, sourceTimeFor } from "@/attributes/shape/fill/implementations/video";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "@/nodes/2d/node2d";
import { AssetTracker } from "@/assets/tracker";
import { prepareFill, resolveFill } from "@/attributes/shape/fill/registry";
import { FillProp, FillResolved } from "@/attributes/shape/fill/union";
import { Sound } from "@/attributes/audio/sound";
import { AudioFilterItem } from "@/attributes/audio/filters/union";
import { AudioFilter, resolveAudioFilters, AudioFilters } from "@/attributes/audio/filters/chain";

export interface VideoProps extends RectProps {
    src?: string;
    /** How the (cropped) frame is scaled into the node's bounds. Default 'fill'. */
    fit?: ImageFit;
    /** Window onto the source frame, in fractions of its own size, applied before `fit`. */
    crop?: ImageCrop;
    /** Magnification on top of the fitted scale. `1` (default) is the fitted size. */
    zoom?: number;
    /** The point held fixed as `zoom` scales; also the alignment when it doesn't cover. */
    anchor?: Anchor;
    /** Raw frame→shape matrix; bypasses `crop`/`fit`/`zoom`/`anchor` and the bounds. */
    matrix?: ImageMatrix;
    /** Visual filters applied to the rendered frame (blur, color, posterizeTime, echo, …). */
    filters?: VideoAdjustment;
    /** Whether playback advances with the node's clock (drives both picture and sound). Default true. */
    playing?: boolean;
    /**
     * Explicit source time to show, in seconds. Omit it (the default) and the
     * picture is timed from the moment this node appeared; set it to drive the
     * playhead yourself, and set it to `null` to hand the playhead back to the
     * clock (`set()` merges a partial, so `undefined` won't clear it).
     */
    timestamp?: number | null;
    trimStart?: number;
    trimEnd?: number;
    /** Playback-rate multiplier for both picture and audio. Default 1. */
    speed?: number;
    loop?: 'forward' | 'reverse' | 'none';
    /** Length of one loop cycle, in seconds. Defaults to the trimmed clip length. */
    duration?: number;
    /** Audio volume in [0, 1]. Default 1. */
    volume?: number;
    /** Silence the video's audio track without affecting the picture. Default false. */
    muted?: boolean;
    /** Audio filters applied to the video's sound track (gain, eq, echo, …). */
    audioFilters?: AudioFilter;
    /**
     * An explicit **playback schedule**: the stretches of this node's own clock
     * during which the clip advances, and where in the source each one starts.
     *
     * Omit it (the default) and playback is what it has always been — the clip
     * runs from the moment the node appears, at `speed`, until it or the node
     * runs out. Give it, and `playing`/`timestamp` are both superseded: the
     * picture takes its source time from whichever segment covers the current
     * `elapsed`, and the sound is scheduled one clip per segment.
     *
     * It exists because a **pause** cannot be expressed any other way. `playing:
     * false` holds the clip's *first* frame, because with playback derived
     * linearly from the clock there is nothing else it could hold; and the sound
     * runs on the node's own clock regardless, so a picture frozen by any means
     * would drift away from it. A schedule states the one thing both halves need
     * and neither could infer — that a paused stretch consumes no source — so
     * they cannot come apart.
     *
     * Still a pure function of the clock, which is the property everything else
     * here is built on: frame *N* is identical however the playhead reached it,
     * so a scrub, a playthrough and an export agree.
     */
    segments?: readonly VideoSegment[];

}

/**
 * One stretch of a {@link Video}'s own clock during which its source advances —
 * see {@link VideoProps.segments}.
 *
 * Trim and loop are applied *on top* of this, by the same code that applies them
 * to unscheduled playback, so a schedule says when the clip is running and the
 * clip's own props go on saying which part of the file it is running through.
 */
export interface VideoSegment {
    /** Second on the node's own clock (`NodeTime.elapsed`) this segment begins. */
    at: number;
    /** Source in-point for it, in seconds. */
    from: number;
    /**
     * How long it runs, in seconds of the node's clock.
     *
     * `Infinity` for a clip left running — the same open sentinel `Sound.trimEnd`
     * and `AudioRequest.endAt` use — which resolves against the clip's length at
     * prepare time.
     */
    duration: number;
    /** Playback rate through it. Defaults to the node's own `speed`. */
    speed?: number;
    /** Linear gain for its sound. Defaults to the node's own `volume`. */
    volume?: number;
}

/**
 * A video. Like {@link Image}, layout and child positioning are inherited
 * wholesale from {@link Rect} — a Video lays out its children exactly like a
 * Rect, just with a *playing* video painted in place of the rect's fill. The
 * frame is drawn through a `video` fill, which resolves the source time to show
 * from this node's clock as it paints.
 *
 * Unlike Image, a Video also plays its own audio track: an internal {@link Sound}
 * (whose `src` is the same file) is scheduled on the scene's audio timeline,
 * trimmed/sped/looped to match the picture. Set `muted` to drop the sound while
 * keeping the picture; `playing: false` freezes both.
 */
export class Video extends Rect<VideoProps> {

    @property() declare src?: string;
    @property() declare fit?: ImageFit;
    @insetsProperty() declare crop: ImageCrop;
    @property({ default: 1 }) declare zoom: number;
    @anchorProperty() declare anchor: Anchor;
    @property() declare matrix?: ImageMatrix;
    @property({ default: [], tween: lerpFilterArray, mapper: resolveChainAdjustments })
    declare filters?: (MediaAdjustment | VideoOnlyAdjustment)[];

    @property({ default: true }) declare playing: boolean;
    @property() declare timestamp?: number | null;
    @property() declare trimStart?: number;
    @property() declare trimEnd?: number;
    @property() declare speed?: number;
    @property() declare loop?: 'forward' | 'reverse' | 'none';
    @property() declare duration?: number;

    @property({ default: 1 }) declare volume: number;
    @property({ default: false }) declare muted: boolean;
    @property({ default: [], mapper: resolveAudioFilters })
    declare audioFilters?: AudioFilterItem[];

    /**
     * The playback schedule — see {@link VideoProps.segments}.
     *
     * Not tweenable, and not a mistake: there is no halfway between two
     * schedules. What moves over time is the playhead *within* one, which is
     * what the schedule describes.
     */
    @property({ default: [] }) declare segments: readonly VideoSegment[];

    /**
     * The `video` fill state `renderSelf` paints — so the picture reuses the
     * exact playback model authors get from `Fills.video(...)`, rather than
     * re-deriving timestamps here. The fill carries no timestamp of its own: it
     * resolves one as it paints, from this node's clock. Rebuilt from props when
     * the source or any playback knob changes (see {@link videoKey}).
     */
    private _video: VideoFillResolved | null = null;
    private _videoKey: string = "";

    /**
     * The video's audio track, played on the scene's audio timeline in lockstep
     * with the picture. Recreated when the source or its trim/loop/speed/volume
     * changes so the scheduled clip stays in sync.
     */
    private _sound: Sound | null = null;
    private _soundKey: string = "";

    /**
     * One `Sound` per segment when a schedule is driving playback — see
     * {@link prepareScheduledSound}. Kept apart from {@link _sound} rather than
     * generalising it to a list, because the two are scheduled on opposite
     * terms: that one is started against the live playhead and this lot are
     * placed up front from the schedule, and a single field would invite the
     * first's `tick`/`start` pattern to be applied to the second.
     */
    private _scheduled: Sound[] = [];
    private _scheduleKey: string = "";

    constructor(props: NodeConfig<Video, VideoProps>) {
        super(props as NodeConfig<Rect, RectProps>);
    }

    /**
     * Seconds of source the schedule has consumed by `elapsed`, or `null` when
     * there is no schedule.
     *
     * The whole of what a schedule *means*: a playing stretch consumes its own
     * length times its rate, a paused one consumes nothing, and the answer is
     * accumulated from the front every time rather than remembered — which is
     * what keeps it identical at every seek. The lists here are short (one entry
     * per play command), and the walk stops at the first segment that has not
     * started, so this is cheaper than the cached fill it feeds.
     */
    private playedAt(elapsed: number): number | null {
        const segments = this.segments;
        if (!segments || segments.length === 0) return null;

        let played = 0;
        for (const segment of segments) {
            if (elapsed <= segment.at) break;
            const speed = segment.speed ?? this.speed ?? 1;
            // `Infinity` on the last segment resolves to "everything left",
            // which `Math.min` gives without a branch: the clip is clamped
            // against its own trim by `sourceTimeFor` a moment later.
            played += Math.min(elapsed - segment.at, segment.duration) * speed;
        }
        return played;
    }

    /**
     * The source time the schedule puts the picture at, or `undefined` to leave
     * the fill deriving one for itself.
     *
     * The offset each segment starts from is folded in as `from - trimStart`, so
     * a schedule whose first segment enters the clip part-way through does what
     * it says while trim and loop still mean what they mean. That is why this
     * hands back a source time rather than a `playStart`: an offset can express
     * "start later", and only an explicit time can express "and stop here".
     */
    private scheduledTimestamp(): number | undefined {
        const played = this.playedAt(this.time.elapsed);
        if (played === null) return undefined;
        const start = this.trimStart ?? 0;
        const first = this.segments[0];
        const entry = first ? first.from - start : 0;
        return sourceTimeFor(
            played + entry,
            start,
            this.trimEnd ?? Infinity,
            this.loop,
            this.duration,
        );
    }

    /** Identity of the props that define the video fill; a change rebuilds it. */
    private videoKey(): string {
        // `crop`/`anchor` read back resolved (an object), so they are flattened
        // here rather than stringified — a tweened crop changes every frame and
        // must invalidate the cached fill, or the picture would freeze mid-tween.
        const crop = this.crop as InsetsResolved;
        const anchor = this.anchor as unknown as Vector2;
        return [
            this.src ?? '', this.fit ?? '', this.zoom, this.playing ? 1 : 0,
            crop.left, crop.right, crop.top, crop.bottom, anchor.x, anchor.y,
            this.timestamp ?? '', this.trimStart ?? '', this.trimEnd ?? '',
            this.speed ?? '', this.loop ?? '', this.duration ?? '',
            // The schedule's answer changes every frame while the clip runs, so
            // it belongs in the key for the same reason a tweened crop does: a
            // fill cached across it would freeze the picture mid-playback.
            this.scheduledTimestamp() ?? '',
        ].join('|');
    }

    /** (Re)build the resolved video fill from current props. */
    private syncVideo(): void {
        if (!this.src) {
            this._video = null;
            this._videoKey = "";
            return;
        }
        const key = this.videoKey();
        if (key === this._videoKey && this._video) return;
        this._videoKey = key;
        const prop: VideoFillProp = {
            type: 'video',
            src: this.src,
            fit: this.fit,
            crop: this.crop,
            zoom: this.zoom,
            anchor: this.anchor,
            matrix: this.matrix,
            filters: this.filters,
            playing: this.playing,
            // A schedule supersedes both: what it resolves *is* the playhead,
            // and it already carries whether the clip is running. An authored
            // `timestamp` still wins over it, since that is the author driving
            // the playhead by hand and this is the document driving it by chain.
            timestamp: this.timestamp ?? this.scheduledTimestamp(),
            trimStart: this.trimStart,
            trimEnd: this.trimEnd,
            speed: this.speed,
            loop: this.loop,
            duration: this.duration,
        };
        this._video = resolveFill(prop as FillProp) as VideoFillResolved;
    }

    /**
     * The audio clip's trimmed source length combined with `speed` collapses into
     * an `AudioFilters.speed` filter on the Sound, so its timeline length matches the
     * picture. Looping the picture loops the sound; a non-looping clip stops at
     * `trimEnd` (or the source's full duration, resolved in {@link prepare}).
     */
    private syncSound(): void {
        if (!this.src) {
            this._sound = null;
            this._soundKey = "";
            return;
        }
        const speed = this.speed ?? 1;
        const looping = (this.loop ?? 'none') !== 'none';
        const key = [
            this.src, this.trimStart ?? 0, this.trimEnd ?? '', speed, looping ? 1 : 0,
            this.volume, this.muted ? 1 : 0, this.audioFilters!.length,
        ].join('|');
        if (key === this._soundKey && this._sound) return;

        this._soundKey = key;
        const filters: AudioFilterItem[] = [];
        if (speed !== 1) filters.push(...resolveAudioFilters(AudioFilters.speed(speed)));
        filters.push(...this.audioFilters!);

        this._sound = new Sound({
            src: this.src,
            volume: this.volume,
            loop: looping,
            trimStart: this.trimStart,
            trimEnd: this.trimEnd,
            filters,
        });
    }

    // Only the sound is advanced here — the picture's timestamp is derived from
    // this node's own time as the fill paints (see `resolveVideoTimestamp`).
    override tick(): void {
        // A scheduled clip's sounds are placed once, from the schedule, and are
        // never advanced against the live playhead — see
        // {@link prepareScheduledSound}. Building the single-clip `Sound` here
        // as well would allocate one per frame that nothing ever plays.
        if (this.segments.length > 0) return;
        this.syncSound();
        this._sound?.tick(this.time.total);
    }

    /**
     * Declare both halves of a clip: the picture and the sound.
     *
     * They used to be split across `prepareRender` (nothing — the picture was
     * inferred from the fill the render pass painted) and `prepareAudio`. Nothing
     * is inferred now, and audio needs no layout, so one hook declares the whole
     * clip and the two can no longer disagree about `src` or the trim window.
     */
    override prepareRender(tracker: AssetTracker): void {
        super.prepareRender(tracker);
        if (!this.src) return;

        // The picture, through the same `syncVideo()` fill `renderSelf` paints.
        this.syncVideo();
        if (this._video) {
            const rect = this.layoutBounds;
            prepareFill(this._video, tracker, rect?.width ?? 0, rect?.height ?? 0);
        }

        // Muted videos draw the picture but contribute no sound. A *paused* one
        // is the same statement only when nothing has scheduled it — with a
        // schedule, `playing` says nothing and the segments say everything.
        if (this.muted) return;
        if (this.segments.length > 0) {
            this.prepareScheduledSound(tracker);
            return;
        }
        if (!this.playing) return;
        this.syncSound();
        const sound = this._sound;
        if (!sound) return;

        // Resolve the full-length default for trimEnd against the *video*'s
        // duration (getMediaDuration falls back to the video manifest), then
        // start the clip once and let this push its request each frame.
        if (sound.trimEnd === Infinity && !sound.loop) {
            sound.trimEnd = tracker.catalog.getMediaDuration(this.src);
        }
        sound.tick(this.time.total);
        sound.start();
        sound.prepare(tracker);
    }

    /**
     * The scheduled half of {@link prepareRender}: one audio clip per segment,
     * cut from the source at the same place the picture is reading from.
     *
     * Built **once** — when the schedule or the source changes — rather than
     * advanced each frame, which is the point. A `Sound` accumulates its
     * requests, so starting and stopping one against a live playhead would make
     * the mix depend on which frames the playhead happened to visit; scrub
     * backwards and you would keep the requests from a future you had already
     * left. Placing every request up front from the schedule alone gives a mix
     * that is the same however the frame was reached, which is the promise the
     * picture has always kept and the sound now keeps with it.
     *
     * One `Sound` per segment rather than one re-trimmed between starts, because
     * a segment carries its own rate and gain: those are a `Sound`'s `filters`
     * and `volume`, read at construction.
     */
    private prepareScheduledSound(tracker: AssetTracker): void {
        const src = this.src;
        if (!src) return;

        const key = [src, this.trimStart ?? '', this.trimEnd ?? '', this.volume,
            this.audioFilters!.length, JSON.stringify(this.segments)].join('|');
        if (key !== this._scheduleKey) {
            this._scheduleKey = key;
            for (const sound of this._scheduled) sound.dispose();
            this._scheduled = [];

            // The out point every segment is clamped against: what the node
            // states, or the source's own length once the container has been
            // read. An open final segment resolves against it here, which is the
            // one thing that cannot be known when the schedule is computed.
            const clipEnd = this.trimEnd ?? tracker.catalog.getMediaDuration(src) ?? Infinity;

            for (const segment of this.segments) {
                const speed = segment.speed ?? this.speed ?? 1;
                const from = segment.from;
                const to = Math.min(clipEnd, from + segment.duration * speed);
                // A segment the clip has already run out of before reaching:
                // nothing left to play, and a zero-length request is one the
                // mixer schedules and immediately stops.
                if (!(to > from)) continue;

                const filters: AudioFilterItem[] = [];
                if (speed !== 1) filters.push(...resolveAudioFilters(AudioFilters.speed(speed)));
                filters.push(...this.audioFilters!);

                const sound = new Sound({
                    src,
                    volume: segment.volume ?? this.volume,
                    trimStart: from,
                    trimEnd: to,
                    filters,
                });
                // Placed on the *scene's* clock: a segment's `at` is on the
                // node's own (`elapsed`), and audio is scheduled in scene time.
                sound.tick(this.time.creation + segment.at);
                sound.start();
                this._scheduled.push(sound);
            }
        }

        for (const sound of this._scheduled) sound.prepare(tracker);
    }


    /**
     * The node's box, as the rect state every pass declares.
     *
     * Split out of {@link shapeGraphics} because the overlay has to declare the
     * same rectangle **twice** inside one mask scope — once as the mask, once as
     * the content — and a `Graphics2D` is a list of ops rather than a shape that
     * can be restated.
     */
    private rectState() {
        return {
            width: this.layoutBounds.width,
            height: this.layoutBounds.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        };
    }

    protected override shapeGraphics(): Graphics2D {
        return new Graphics2D().rect(this.rectState());
    }

    /**
     * The overlay, **clipped to the picture's own alpha** rather than to the
     * node's box.
     *
     * {@link ShapeNode} fills the silhouette, which for a media node is its rect
     * — and on a cut-out PNG that is the wrong shape by a wide margin: a wash
     * meant to tint the subject floods the transparent surround, so the whole
     * box turns colour. Not a subtle error.
     *
     * So the picture is declared as an **alpha mask** and the overlay as the
     * content inside it. `MaskMode.alpha` is the mask machinery's default and is
     * exactly this operation, so the renderer had nothing new to learn.
     *
     * A media node with no source paints no overlay at all: there is nothing
     * drawn to lay anything over, and falling back to the box would reintroduce
     * the bug precisely where it is most visible.
     */
    protected override renderOverlay(ctx: RenderContext2D): void {
        const overlay = this.overlay as FillResolved[];
        if (overlay.length === 0) return;
        const picture = (this.syncVideo(), this._video);
        if (!picture) return;

        ctx.draw(
            new Graphics2D()
                .mask()
                .rect(this.rectState())
                .fill([picture as unknown as FillProp])
                .applyMask()
                .rect(this.rectState())
                .fill(overlay as unknown as FillProp[])
                .endMask(),
        );
    }

    protected override renderSelf(draw: RenderContext2D): void {
        this.syncVideo();
        // Paint the video fill first (so it sits behind any user-supplied `fill`
        // layers — a tint or vignette over the frame), styled as the rect's fill.
        // Stroke is deferred to renderStroke (drawn after children + overlay), so
        // an overlay texture lands over the video and under the frame.
        const fills: FillProp[] = this._video ? [this._video as FillProp] : [];
        fills.push(...(this.fill as unknown as FillProp[]));

        draw.draw(this.shapeGraphics().shadow(this.shadow).fill(fills));
    }

    override dispose(): void {
        this._sound?.dispose();
        this._sound = null;
        this._soundKey = "";
        for (const sound of this._scheduled) sound.dispose();
        this._scheduled = [];
        this._scheduleKey = "";
        this._video = null;
        this._videoKey = "";
        super.dispose();
    }
}
