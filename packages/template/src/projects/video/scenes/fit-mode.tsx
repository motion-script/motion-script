import { Fill } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** `fit` mode — the whole frame is contained, letterboxing as needed. */
export class VideoFitScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — fit',
        fill: Fill.video(SAMPLE_VIDEO, { mode: 'fit', loop: 'forward' }),
    };
}
