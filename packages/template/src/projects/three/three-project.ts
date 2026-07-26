import { createProject } from 'motion-script';

import spinningCube from './scenes/spinning-cube?scene';
import waveGrid from './scenes/wave-grid?scene';

/**
 * 3D scenes, exercising the `Scene3D` node and the `Graphics3D` API.
 *
 * To preview: re-export as the default from `src/project.ts`.
 * To screenshot: `ms screenshot last --scenes spinning-cube`
 */
export default createProject({
    name: '3D Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        spinningCube,
        waveGrid,
    ],
});
