import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/** `stretch` mode — the frame is scaled on each axis to fill the box, distorting aspect ratio. */
export default createScene(videoFill({
        label: 'Video — stretch',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'stretch', loop: 'forward' }),
    }));
