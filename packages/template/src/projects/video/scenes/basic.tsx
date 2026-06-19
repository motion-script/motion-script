import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/** Plain looping video fill — the clip plays and loops as the scene holds. */
export default createScene(videoFill({
        label: 'Video Fills',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'fill', loop: 'forward' }),
    }));
