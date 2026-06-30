import { AudioFilters } from "motion-script";
import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/** TremoloFilter: pulses the volume with a low-frequency oscillator (wobble). */
export default createScene(audioDemo({
        label: 'Tremolo 6 Hz',
        filters: AudioFilters.tremolo(6, 0.7),
    }));
