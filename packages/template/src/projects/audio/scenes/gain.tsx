import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** GainFilter: scales the clip's volume by a linear factor. */
export class GainScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Gain ×2',
        filters: AFX.gain(2),
    };
}
