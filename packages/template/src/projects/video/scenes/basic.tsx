import { Fills } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** Plain looping video fill — the clip plays and loops as the scene holds. */
export class VideoBasicScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video Fills',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'fill', loop: 'forward' }),
    };
}
