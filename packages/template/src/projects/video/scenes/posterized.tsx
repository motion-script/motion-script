import { Fills, MX } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/**
 * Video fill resampled with a `posterizeTime` filter. The clip's playhead snaps
 * to a 6 fps grid, so each source frame is held for ~10 render frames (at 60fps)
 * — the stop-motion stutter. Purely temporal: no pixels are altered, only which
 * frame shows.
 */
export class VideoPosterizedScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — posterize time (6fps)',
        fill: Fills.video(SAMPLE_VIDEO, {
            fit: 'fill',
            loop: 'forward',
            filters: MX.posterizeTime(6),
        }),
    };
}
