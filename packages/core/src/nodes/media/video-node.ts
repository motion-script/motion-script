import { RenderContext } from "@/render/render-context";
import { Graphics } from "@/render/graphics";
import { ChainableMx, resolveChainFilters } from "@/attributes/shape/filters/chain";
import { FilterRegistry } from "@/attributes/shape/filters/registry";
import { MediaFilter } from "@/attributes/shape/filters/union";
import { ImageFillMode, ImageTransform } from "@/attributes/shape/fill/implementations/image";
import { VideoFillProp, VideoFillResolved } from "@/attributes/shape/fill/implementations/video";
import { Rect, RectProps } from "../geometry/rect-node";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { AssetTracker } from "@/assets/tracker";
import { resolveFill, updateFill } from "@/attributes/shape/fill/registry";
import { FillProp } from "@/attributes/shape/fill/union";
import { Sound } from "@/attributes/audio/sound";
import { AudioFilter } from "@/attributes/audio/filters/union";
import { ChainableAfx, resolveAudioFilters, AFX } from "@/attributes/audio/filters/chain";

export interface VideoProps extends RectProps {
    src?: string;
    /** Fit mode for the painted frame (fill | fit | crop | tile). Default 'fill'. */
    fit?: ImageFillMode;
    transform?: ImageTransform;
    scaling?: number;
    /** Visual filters applied to the rendered frame (blur, color, etc.). */
    filters?: ChainableMx;
    /** Whether playback advances each frame (drives both picture and sound). Default true. */
    playing?: boolean;
    /** Starting offset into the source, in seconds. Defaults to `trimStart` (or 0). */
    timestamp?: number;
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
    audioFilters?: ChainableAfx;
}

/**
 * A video. Like {@link Image}, layout and child positioning are inherited
 * wholesale from {@link Rect} — a Video lays out its children exactly like a
 * Rect, just with a *playing* video painted in place of the rect's fill. The
 * frame is drawn through the dynamic `video` fill, whose timestamp this node
 * advances each tick.
 *
 * Unlike Image, a Video also plays its own audio track: an internal {@link Sound}
 * (whose `src` is the same file) is scheduled on the scene's audio timeline,
 * trimmed/sped/looped to match the picture. Set `muted` to drop the sound while
 * keeping the picture; `playing: false` freezes both.
 */
export class Video extends Rect {

    @property() declare src?: string;
    @property() declare fit?: ImageFillMode;
    @property() declare transform?: ImageTransform;
    @property() declare scaling?: number;
    @property({ default: [], tween: FilterRegistry.lerpArray, mapper: resolveChainFilters })
    declare filters?: MediaFilter[];

    @property({ default: true }) declare playing: boolean;
    @property() declare timestamp?: number;
    @property() declare trimStart?: number;
    @property() declare trimEnd?: number;
    @property() declare speed?: number;
    @property() declare loop?: 'forward' | 'reverse' | 'none';
    @property() declare duration?: number;

    @property({ default: 1 }) declare volume: number;
    @property({ default: false }) declare muted: boolean;
    @property({ default: [], mapper: resolveAudioFilters })
    declare audioFilters?: AudioFilter[];

    /**
     * The live `video` fill state, advanced each tick by the fill's own dynamic
     * `update()` (loop / trim / clamp logic). `renderSelf` paints this — so the
     * picture reuses the exact playback model authors get from `Fill.video(...)`,
     * rather than re-deriving timestamps here. Rebuilt from props when the source
     * or any playback knob changes (see {@link videoKey}).
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
        return [
            this.src ?? '', this.fit ?? '', this.scaling ?? '', this.playing ? 1 : 0,
            this.timestamp ?? '', this.trimStart ?? '', this.trimEnd ?? '',
            this.speed ?? '', this.loop ?? '', this.duration ?? '',
        ].join('|');
    }

    /** (Re)build the resolved video fill from current props, preserving the
     * advanced timestamp across rebuilds that don't reset playback. */
    private syncVideo(): void {
        if (!this.src) {
            this._video = null;
            this._videoKey = "";
            return;
        }
        const key = this.videoKey();
        if (key === this._videoKey && this._video) return;
        const prevTimestamp = this._video?.timestamp;
        this._videoKey = key;
        const prop: VideoFillProp = {
            type: 'video',
            src: this.src,
            mode: this.fit,
            transform: this.transform,
            scaling: this.scaling,
            filters: this.filters,
            playing: this.playing,
            timestamp: this.timestamp ?? prevTimestamp ?? this.trimStart ?? 0,
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
     * an `AFX.speed` filter on the Sound, so its timeline length matches the
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
        const filters: AudioFilter[] = [];
        if (speed !== 1) filters.push(...resolveAudioFilters(AFX.speed(speed)));
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

    override tick(time: number): void {
        super.tick(time);
        this.syncVideo();
        if (this._video) {
            this._video = updateFill(this._video, time, this.assets) as VideoFillResolved;
        }
        this.syncSound();
        this._sound?.tick(time);
    }

    override prepare(tracker: AssetTracker): void {
        super.prepare(tracker);
        if (!this.src) return;
        this.syncVideo();

        // Picture: register the video for frame decoding at the node's size,
        // honouring the active trim (same request the video fill would emit).
        tracker.requestVideo(
            this.src,
            this.layoutRect.width,
            this.layoutRect.height,
            this.trimStart ?? 0,
            this.trimEnd,
        );

        // Audio: schedule the video's own track. Muted or paused videos draw the
        // picture but contribute no sound.
        if (this.muted || !this.playing) return;
        this.syncSound();
        const sound = this._sound;
        if (!sound) return;

        // Resolve the full-length default for trimEnd against the *video*'s
        // duration (getMediaDuration falls back to the video manifest), then
        // start the clip once and let prepare() push its request each frame.
        if (sound.trimEnd === Infinity && !sound.loop) {
            sound.trimEnd = tracker.catalog.getMediaDuration(this.src);
        }
        sound.tick(this.clock.time);
        sound.start();
        sound.prepare(tracker);
    }

    protected override renderSelf(draw: RenderContext): void {
        this.syncVideo();
        // Paint the video fill first (so it sits behind any user-supplied `fill`
        // layers — a tint or vignette over the frame), styled as the rect's fill.
        const fills: FillProp[] = this._video ? [this._video as FillProp] : [];
        fills.push(...(this.fill as unknown as FillProp[]));

        draw.draw(new Graphics()
            .rect({
                width: this.layoutRect.width,
                height: this.layoutRect.height,
                borderRadius: this.borderRadius,
                start: this.start,
                end: this.end,
            })
            .shadow(this.shadow).fill(fills).stroke(this.stroke));
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
