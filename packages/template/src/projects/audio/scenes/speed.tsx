import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/**
 * SpeedFilter: changes playback rate (and pitch). The clip occupies less
 * timeline time, so the sweep bar visibly finishes sooner.
 */
export class SpeedScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Speed ×2',
        filters: AFX.speed(2),
    };
}
