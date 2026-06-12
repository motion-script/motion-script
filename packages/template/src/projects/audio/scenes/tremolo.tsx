import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** TremoloFilter: pulses the volume with a low-frequency oscillator (wobble). */
export class TremoloScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Tremolo 6 Hz',
        filters: AFX.tremolo(6, 0.7),
    };
}
