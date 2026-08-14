import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { VideoFilter, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { lerpFilterArray } from "@/attributes/shape/filters/registry";
import { MediaFilter, VideoMediaFilter } from "@/attributes/shape/filters/union";
import { ImageCrop, ImageFit, ImageMatrix } from "@/attributes/shape/fill/implementations/image";
import { Anchor } from "@/attributes/layout/anchor";
import { InsetsResolved } from "@/attributes/layout/insets";
import { Vector2 } from "@/attributes/layout/vector2";
import { anchorProperty, insetsProperty } from "@/attributes/properties/typed";
import { VideoFillProp, VideoFillResolved } from "@/attributes/shape/fill/implementations/video";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";
import { prepareFill, resolveFill } from "@/attributes/shape/fill/registry";
import { FillProp } from "@/attributes/shape/fill/union";
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
    filters?: VideoFilter;
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
    @property({ default: [], tween: lerpFilterArray, mapper: resolveChainFilters })
    declare filters?: (MediaFilter | VideoMediaFilter)[];

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

    constructor(props: NodeConfig<Video, VideoProps>) {
        super(props as NodeConfig<Rect, RectProps>);
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
            timestamp: this.timestamp,
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
    // this node's clock as the fill paints (see `resolveVideoTimestamp`).
    override tick(time: number): void {
        super.tick(time);
        this.syncSound();
        this._sound?.tick(time);
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
            const rect = this.layoutRect;
            prepareFill(this._video, tracker, rect?.width ?? 0, rect?.height ?? 0);
        }

        // Muted or paused videos draw the picture but contribute no sound.
        if (this.muted || !this.playing) return;
        this.syncSound();
        const sound = this._sound;
        if (!sound) return;

        // Resolve the full-length default for trimEnd against the *video*'s
        // duration (getMediaDuration falls back to the video manifest), then
        // start the clip once and let this push its request each frame.
        if (sound.trimEnd === Infinity && !sound.loop) {
            sound.trimEnd = tracker.catalog.getMediaDuration(this.src);
        }
        sound.tick(this.clock.time);
        sound.start();
        sound.prepare(tracker);
    }


    protected override shapeGraphics(): Graphics {
        return new Graphics().rect({
            width: this.layoutRect.width,
            height: this.layoutRect.height,
            cornerRadius: this.cornerRadius,
            cornerStyle: this.cornerStyle,
            start: this.start,
            end: this.end,
        });
    }

    protected override renderSelf(draw: RenderContext): void {
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
        this._video = null;
        this._videoKey = "";
        super.dispose();
    }
}
