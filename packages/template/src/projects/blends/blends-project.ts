import { createProject } from 'motion-script';

import multiply from './scenes/multiply?scene';
import screen from './scenes/screen?scene';
import overlay from './scenes/overlay?scene';
import darken from './scenes/darken?scene';
import lighten from './scenes/lighten?scene';
import colorDodge from './scenes/color-dodge?scene';
import colorBurn from './scenes/color-burn?scene';
import hardLight from './scenes/hard-light?scene';
import softLight from './scenes/soft-light?scene';
import difference from './scenes/difference?scene';
import exclusion from './scenes/exclusion?scene';
import hue from './scenes/hue?scene';
import saturation from './scenes/saturation?scene';
import color from './scenes/color?scene';
import luminosity from './scenes/luminosity?scene';
import normal from './scenes/normal?scene';

/**
 * A project that walks through every `mix-blend-mode` keyword, one scene
 * per mode. Each scene lays a 3x2 grid of squares (top row painted via
 * `fill`, bottom row via `stroke` — color, linear gradient, and image fills
 * left to right) over a photo, fading every square's opacity from 0 to 1
 * with the scene's blend mode applied.
 *
 * Not auto-run by `ms` (which discovers `src/project.ts`). To render it,
 * temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Blend Modes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        multiply,
        screen,
        overlay,
        darken,
        lighten,
        colorDodge,
        colorBurn,
        hardLight,
        softLight,
        difference,
        exclusion,
        hue,
        saturation,
        color,
        luminosity,
        normal,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD'
        },
    },
});
