import { createProject } from '@motion-script/core';

import {
    MultiplyBlendScene,
    ScreenBlendScene,
    OverlayBlendScene,
    DarkenBlendScene,
    LightenBlendScene,
    ColorDodgeBlendScene,
    ColorBurnBlendScene,
    HardLightBlendScene,
    SoftLightBlendScene,
    DifferenceBlendScene,
    ExclusionBlendScene,
    HueBlendScene,
    SaturationBlendScene,
    ColorBlendScene,
    LuminosityBlendScene,
    NormalBlendScene,
} from './scenes';

/**
 * A project that walks through every `mix-blend-mode` keyword, one scene
 * per mode. Each scene lays a 3x2 grid of squares (top row painted via
 * `fill`, bottom row via `stroke` — color, linear gradient, and image fills
 * left to right) over a photo, fading every square's opacity from 0 to 1
 * with the scene's blend mode applied.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Blend Modes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        new MultiplyBlendScene(),
        new ScreenBlendScene(),
        new OverlayBlendScene(),
        new DarkenBlendScene(),
        new LightenBlendScene(),
        new ColorDodgeBlendScene(),
        new ColorBurnBlendScene(),
        new HardLightBlendScene(),
        new SoftLightBlendScene(),
        new DifferenceBlendScene(),
        new ExclusionBlendScene(),
        new HueBlendScene(),
        new SaturationBlendScene(),
        new ColorBlendScene(),
        new LuminosityBlendScene(),
        new NormalBlendScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD'
    },
});
