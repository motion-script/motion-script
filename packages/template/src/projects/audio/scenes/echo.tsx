import { AFX } from "@motion-script/core";
import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** EchoFilter: adds a delayed, fading repeat of the signal. */
export class EchoScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Echo 0.3s',
        filters: AFX.echo(0.3, 0.45, 0.5),
    };
}
