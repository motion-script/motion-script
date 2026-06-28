import { AudioFilters } from "@motion-script/core";
import { createScene } from "@motion-script/core";
import { audioDemo } from "./audio-demo";

/**
 * SpeedFilter: changes playback rate (and pitch). The clip occupies less
 * timeline time, so the sweep bar visibly finishes sooner.
 */
export default createScene(audioDemo({
        label: 'Speed ×2',
        filters: AudioFilters.speed(2),
    }));
