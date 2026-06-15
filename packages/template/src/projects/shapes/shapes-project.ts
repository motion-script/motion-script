import { createProject } from '@motion-script/core';

import {
    RectScene,
    EllipseScene,
    PolygonScene,
    PolygramScene,
    PathScene,
} from './scenes';

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
        new RectScene(),
        new EllipseScene(),
        new PolygonScene(),
        new PolygramScene(),
        new PathScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD',
    },
});
