import { Fills, VideoFilters } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/**
 * Video fill with a `MediaFilter` chain applied. The same visual filters that
 * work on image fills apply to the live video frame each tick — here a grayscale
 * + blur, composed via the `VideoFilters` builder.
 */
export default createScene(videoFill({
        label: 'Video — grayscale + blur',
        fill: Fills.video(SAMPLE_VIDEO, {
            fit: 'fill',
            loop: 'forward',
            filters: [...VideoFilters.grayscale(1).blur(6)],
        }),
    }));
