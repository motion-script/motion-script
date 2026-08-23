import { createProject } from 'motion-script';

import spinningCube from './scenes/spinning-cube?scene';
import waveGrid from './scenes/wave-grid?scene';
import sombrero from './scenes/sombrero-scene?scene';
import graph3d from './scenes/graph3d-scene?scene';
import monitors from './scenes/monitors?scene';
import monitorNode from './scenes/monitor-node-scene?scene';
import fillShapes from './scenes/fill-shapes?scene';
import fillStack from './scenes/fill-stack?scene';

/**
 * 3D scenes, exercising the `Canvas3D` node and the `Graphics3D` API.
 *
 * To preview: re-export as the default from `src/project.ts`.
 * To screenshot: `ms screenshot last --scenes SpinningCube` — scene names come
 * from the filename (`spinning-cube.tsx` → `SpinningCube`) and match exactly.
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
        sombrero,
        graph3d,
        monitors,
        monitorNode,
        fillShapes,
        fillStack,
    ],
});
