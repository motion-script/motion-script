import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** HighPassFilter: rolls off frequencies below the cutoff (thin, tinny). */
export class HighPassScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'High-pass 2000 Hz',
        filters: AFX.highpass(2000),
    };
}
