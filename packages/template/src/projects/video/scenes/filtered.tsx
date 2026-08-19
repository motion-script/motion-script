import { Fills, VideoAdjustments } from "motion-script";
import { createScene } from "motion-script";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/**
 * Video fill with a `MediaAdjustment` chain applied. The same visual filters that
 * work on image fills apply to the live video frame each tick — here a grayscale
 * + blur, composed via the `VideoAdjustments` builder.
 */
export default createScene(videoFill({
        label: 'Video — grayscale + blur',
        fill: Fills.video(SAMPLE_VIDEO, {
            fit: 'fill',
            loop: 'forward',
            filters: [...VideoAdjustments.grayscale(1).blur(6)],
        }),
    }));
