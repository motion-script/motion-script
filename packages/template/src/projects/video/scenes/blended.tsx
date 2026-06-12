import { Fill } from "@motion-script/core";
import { VideoFillScene, VideoFillSpec, SAMPLE_VIDEO } from "./video-fill";

/**
 * A video fill layered with a tint via `opacity` + `blend`, over a solid color
 * underneath — exercising the generic fill-stack handling (opacity/blend apply
 * to video exactly as to any other fill).
 */
export class VideoBlendedScene extends VideoFillScene {
    readonly spec: VideoFillSpec = {
        label: 'Video — opacity + blend',
        fill: Fill.color('#1b6')
            .video(SAMPLE_VIDEO, { mode: 'fill', loop: 'forward', opacity: 0.7, blend: 'overlay' }),
    };
}
