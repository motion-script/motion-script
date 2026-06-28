import { Fills, VideoFilters } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { videoFill, SAMPLE_VIDEO } from "./video-fill";

/**
 * Video fill with an `echo` filter — a fading motion trail. Four past frames,
 * each 80ms apart, are composited behind the current frame at a 0.6-per-tap
 * decay using a screen blend. The trail fills in over the first ~second of
 * playback as the decoded back-window warms.
 */
export default createScene(videoFill({
        label: 'Video — echo (motion trail)',
        fill: Fills.video(SAMPLE_VIDEO, {
            fit: 'fill',
            loop: 'forward',
            filters: VideoFilters.echo({ echoes: 8, delay: 0.1, decay: 0.5, blend: 'screen' }),
        }),
    }));
