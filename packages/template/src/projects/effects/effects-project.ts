import { createProject } from '@motion-script/core';

import blur from './scenes/blur?scene';
import directionalBlur from './scenes/directional-blur?scene';
import backgroundBlur from './scenes/background-blur?scene';
import grayscale from './scenes/grayscale?scene';
import pixelate from './scenes/pixelate?scene';
import bulge from './scenes/bulge?scene';
import magnify from './scenes/magnify?scene';
import bloom from './scenes/bloom?scene';
import vintage from './scenes/vintage?scene';
import chromaticAberration from './scenes/chromatic-aberration?scene';
import scatter from './scenes/scatter?scene';
import posterize from './scenes/posterize?scene';
import frosted from './scenes/frosted?scene';
import retroVhs from './scenes/retro-vhs?scene';
import invert from './scenes/invert?scene';
import motionBlur from './scenes/motion-blur?scene';

/**
 * A project that walks through every built-in effect, one scene per effect.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To preview
 * it, point the `@motion-script/vite-plugin` `entry` option at this file, or
 * temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Effects Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080 - 240,
    },
    scenes: [
        blur,
        directionalBlur,
        backgroundBlur,
        grayscale,
        pixelate,
        bulge,
        magnify,
        bloom,
        vintage,
        chromaticAberration,
        scatter,
        posterize,
        frosted,
        retroVhs,
        invert,
        motionBlur,
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#1e232b',
        'primary': '#6990DD'
    },
});
