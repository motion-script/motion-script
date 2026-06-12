import { AudioDemoScene, AudioDemoSpec } from "./audio-demo";

/** The unfiltered clip, as a reference to compare the filtered scenes against. */
export class OriginalScene extends AudioDemoScene {
    readonly spec: AudioDemoSpec = {
        label: 'Original',
    };
}
