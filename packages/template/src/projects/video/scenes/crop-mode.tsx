import { Fill } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** `crop` mode — the frame fills the box and overflows, preserving aspect ratio. */
export class VideoCropScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — crop',
        fill: Fill.video(SAMPLE_VIDEO, { mode: 'crop', loop: 'forward' }),
    };
}
