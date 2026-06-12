import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/**
 * Several filters chained on one clip. They apply in order (gain → low-pass →
 * echo), each feeding the next, so the result is a louder, muffled, echoing clip.
 */
export class MultipleFiltersScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Gain + Low-pass + Echo',
        filters: AFX.gain(1.5).lowpass(800).echo(0.3, 0.4, 0.4),
    };
}
