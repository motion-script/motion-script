import { Fills } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/** `stretch` mode — the frame is scaled on each axis to fill the box, distorting aspect ratio. */
export class VideoCropScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — stretch',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'stretch', loop: 'forward' }),
    };
}
