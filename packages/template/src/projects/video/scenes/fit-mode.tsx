import { Fills } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** `fit` mode — the whole frame is contained, letterboxing as needed. */
export class VideoFitScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — fit',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'fit', loop: 'forward' }),
    };
}
