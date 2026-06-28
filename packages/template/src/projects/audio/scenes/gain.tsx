import { AudioFilters } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { audioDemo } from "./audio-demo";

/** GainFilter: scales the clip's volume by a linear factor. */
export default createScene(audioDemo({
        label: 'Gain ×2',
        filters: AudioFilters.gain(2),
    }));
