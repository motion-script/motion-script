import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** LowPassFilter: rolls off frequencies above the cutoff (muffled, bassy). */
export class LowPassScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Low-pass 500 Hz',
        filters: AFX.lowpass(500),
    };
}
