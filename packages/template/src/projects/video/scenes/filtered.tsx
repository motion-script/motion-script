import { Fills, MX } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/**
 * Video fill with a `MediaFilter` chain applied. The same visual filters that
 * work on image fills apply to the live video frame each tick — here a grayscale
 * + blur, composed via the `MX` builder.
 */
export class VideoFilteredScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — grayscale + blur',
        fill: Fills.video(SAMPLE_VIDEO, {
            fit: 'fill',
            loop: 'forward',
            filters: [...MX.grayscale(1).blur(6)],
        }),
    };
}
