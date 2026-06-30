import { AudioFilters } from "motion-script";
import { createScene } from "motion-script";
import { audioDemo } from "./audio-demo";

/** EchoFilter: adds a delayed, fading repeat of the signal. */
export default createScene(audioDemo({
        label: 'Echo 0.3s',
        filters: AudioFilters.echo(0.3, 0.45, 0.5),
    }));
