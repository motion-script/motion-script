import { Fills } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** `crop` mode — the frame fills the box and overflows, preserving aspect ratio. */
export class VideoCropScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — crop',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'crop', loop: 'forward' }),
    };
}
