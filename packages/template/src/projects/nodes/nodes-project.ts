import { createProject } from 'motion-script';

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
import latex from './scenes/latex-scene?scene';
import code from './scenes/code-scene?scene';
import customScene from './scenes/custom-scene';
import composite from './scenes/composite-scene?scene';
import fanScene from './scenes/fan-scene?scene';
import dataScene from './scenes/data-scene?scene';

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
        // text,
        // richText,
        // number,
        // rect,
        // ellipse,
        // polygon,
        // polygram,
        lineGrid,
        // camera,
        // row,
        // column,
        grid,
        // image,
        // video,
        // path,
        // latex,
        // code,
        // customScene,
        // composite,
        // fanScene,
        // dataScene,
    ],
    theme: {
        colors: {
            bg: '#0D0F15',
            card: '#1e232b',
            primary: '#6990DD',
            // Nested group → flattened to brand-100 … brand-900, e.g. fill="brand-500".
            brand: {
                100: '#e0f2fe',
                200: '#bae6fd',
                300: '#7dd3fc',
                400: '#38bdf8',
                500: '#0ea5e9',
                600: '#0284c7',
                700: '#0369a1',
                800: '#075985',
                900: '#0c4a6e',
            },
        },
        // Named text presets selected via a Text/RichText `variant`.
        typography: {
            small: { fontSize: 28 },
            body: { fontSize: 32, lineHeight: 1.4 },
            header: { fontSize: 96, fontWeight: 700 },
        },
    },
    // Arbitrary project constants read in scene generators via stage.variables(...).
    variables: {
        'rounded-sm': 8,
        'rounded-md': 16,
        'rounded-lg': 32,
    },
});
