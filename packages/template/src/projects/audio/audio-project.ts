import { createProject } from '@motion-script/core';

import {
    OriginalScene,
    GainScene,
    LowPassScene,
    HighPassScene,
    TremoloScene,
    SpeedScene,
    EchoScene,
    MultipleFiltersScene,
    PlaySoundScene,
    StartStopSoundScene,
    MultipleSoundsScene,
} from './scenes';

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
        new OriginalScene(),
        new GainScene(),
        new LowPassScene(),
        new HighPassScene(),
        new TremoloScene(),
        new SpeedScene(),
        new EchoScene(),
        new MultipleFiltersScene(),
        new PlaySoundScene(),
        new StartStopSoundScene(),
        new MultipleSoundsScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD'
    },
});
