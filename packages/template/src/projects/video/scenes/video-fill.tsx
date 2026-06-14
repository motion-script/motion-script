/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Rect, Text, Fills, wait } from "@motion-script/core";
import type { ImageFillMode } from "@motion-script/core";

/**
 * A labelled card holding one `Rect` whose fill is a *playing* video. The video
 * advances its timestamp each frame (via the dynamic fill's `update`), so the
 * card animates the clip even though nothing in the scene tweens. Subclasses
 * pick the fit `mode` and optional `MediaFilter`s; the base lays out the card
 * and holds for the clip's length so scrubbing/export has frames to show.
 */
export interface VideoFillSpec {
    label: string;
    /** Fills mode passed to the video fill (fit/crop/tile/fill). Default 'fill'. */
    mode?: ImageFillMode;
    /** A fill chain to use directly; overrides the default `Fills.video(...)`. */
    fill?: ReturnType<typeof Fills.video>;
    /** Seconds to hold the scene (give the clip time to play). Default 4. */
    duration?: number;
}

export const SAMPLE_VIDEO = 'video.mp4';

export abstract class VideoFillScene extends Scene {
    abstract readonly spec: VideoFillSpec;

    *build() {
        this.set({ fill: 'bg' });

        const { label, mode = 'fill', fill, duration = 4 } = this.spec;
        const videoFill = fill ?? Fills.video(SAMPLE_VIDEO, { fit: mode, loop: 'forward' });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={32} fill={videoFill} />
            </Rect>
        );

        yield* wait(duration);
    }
}
