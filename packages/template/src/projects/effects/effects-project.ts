import { createProject } from '@motion-script/core';

import {
    BlurScene,
    DirectionalBlurScene,
    BackgroundBlurScene,
    GrayscaleScene,
    PixelateScene,
    BulgeScene,
    MagnifyScene,
    BloomScene,
    VintageScene,
    ChromaticAberrationScene,
    ScatterScene,
    PosterizeScene,
    FrostedScene,
    RetroVhsScene,
    InvertScene,
    MotionBlurScene,
} from './scenes';

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
        new BlurScene(),
        new DirectionalBlurScene(),
        new BackgroundBlurScene(),
        new GrayscaleScene(),
        new PixelateScene(),
        new BulgeScene(),
        new MagnifyScene(),
        new BloomScene(),
        new VintageScene(),
        new ChromaticAberrationScene(),
        new ScatterScene(),
        new PosterizeScene(),
        new FrostedScene(),
        new RetroVhsScene(),
        new InvertScene(),
        new MotionBlurScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#1e232b',
        'primary': '#6990DD'
    },
});
