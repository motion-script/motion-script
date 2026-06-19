import { Fills } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/** `fit` mode — the whole frame is contained, letterboxing as needed. */
export default createScene(videoFill({
        label: 'Video — fit',
        fill: Fills.video(SAMPLE_VIDEO, { fit: 'fit', loop: 'forward' }),
    }));
