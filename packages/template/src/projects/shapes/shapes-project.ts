import { createProject } from 'motion-script';

import rect from './scenes/rect-scene?scene';
import ellipse from './scenes/ellipse-scene?scene';
import polygon from './scenes/polygon-scene?scene';
import polygram from './scenes/polygram-scene?scene';
import path from './scenes/path-scene?scene';
import textSelection from './scenes/text-selection?scene';
import code from '../../scenes/code-scene?scene';
import textPath from './scenes/text-path?scene';

/**
 * A project that showcases each shape node and its unique properties.
 * Each scene animates the shape-specific properties with fill and stroke
 * samples shown side by side.
 */
export default createProject({
    name: 'Shapes Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        code,
        textPath,
        textSelection,
        rect,
        ellipse,
        polygon,
        polygram,
        path,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD',
        },
    },
});
