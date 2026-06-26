import { createProject } from '@motion-script/core';

import text from './scenes/text-scene?scene';
import richText from './scenes/rich-text-scene?scene';
import number from './scenes/number-scene?scene';
import rect from './scenes/rect-scene?scene';
import ellipse from './scenes/ellipse-scene?scene';
import polygon from './scenes/polygon-scene?scene';
import polygram from './scenes/polygram-scene?scene';
import lineGrid from './scenes/line-grid-scene?scene';
import camera from './scenes/camera-scene?scene';
import row from './scenes/row-scene?scene';
import column from './scenes/column-scene?scene';
import grid from './scenes/grid-scene?scene';
import image from './scenes/image-scene?scene';
import video from './scenes/video-scene?scene';
import path from './scenes/path-scene?scene';
import customScene from './scenes/custom-scene';

/**
 * One scene per built-in node — used to generate the screenshots and
 * videos embedded in the "Available Nodes" docs section.
 *
 * To preview: re-export as the default from `src/project.ts`.
 * To export:  run `ms export` with this file as the entry.
 */
export default createProject({
    name: 'Nodes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        text,
        richText,
        number,
        rect,
        ellipse,
        polygon,
        polygram,
        lineGrid,
        camera,
        row,
        column,
        grid,
        image,
        video,
        path,
        customScene
    ],
    theme: {
        bg: '#0D0F15',
        card: '#1e232b',
        primary: '#6990DD',
    },
});
