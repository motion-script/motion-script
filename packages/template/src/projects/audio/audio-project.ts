import { createProject } from '@motion-script/core';

import original from './scenes/original?scene';
import gain from './scenes/gain?scene';
import lowpass from './scenes/lowpass?scene';
import highpass from './scenes/highpass?scene';
import tremolo from './scenes/tremolo?scene';
import speed from './scenes/speed?scene';
import echo from './scenes/echo?scene';
import fade from './scenes/fade?scene';
import filterSweep from './scenes/filter-sweep?scene';
import multipleFilters from './scenes/multiple-filters?scene';
import playSound from './scenes/play-sound?scene';
import startStopSound from './scenes/start-stop-sound?scene';
import multipleSounds from './scenes/multiple-sounds?scene';
import crossSceneBedA from './scenes/cross-scene-bed-a?scene';
import crossSceneBedB from './scenes/cross-scene-bed-b?scene';

/**
 * A project that walks through every audio filter (one scene each, plus a
 * combined chain) and the audio-playback API: the blocking `playSound`, the
 * non-blocking `startSound`/`stopSound`, and two sounds mixed at once. Each
 * scene pairs a label with a simple visual so the otherwise-invisible audio has
 * something to watch — `speed` clips visibly finish sooner.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Audio Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        original,
        gain,
        lowpass,
        highpass,
        tremolo,
        speed,
        echo,
        fade,
        filterSweep,
        multipleFilters,
        playSound,
        startStopSound,
        multipleSounds,
        crossSceneBedA,
        crossSceneBedB,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD'
        },
    },
});
