import { AudioFilters } from "motion-script";
import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/**
 * Several filters chained on one clip. They apply in order (gain → low-pass →
 * echo), each feeding the next, so the result is a louder, muffled, echoing clip.
 */
export default createScene(audioDemo({
        label: 'Gain + Low-pass + Echo',
        filters: AudioFilters.gain(1.5).lowpass(800).echo({ delay: 0.3, feedback: 0.4, mix: 0.4 }),
    }));
