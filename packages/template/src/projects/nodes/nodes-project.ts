import { createProject } from '@motion-script/core';

import {
    TextScene,
    RichTextScene,
    RectScene,
    EllipseScene,
    PolygonScene,
    PolygramScene,
    LineGridScene,
    CameraScene,
    RowScene,
    ColumnScene,
    GridScene,
    ImageScene,
    VideoScene,
    PathScene,
} from './scenes';

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
        new TextScene(),
        new RichTextScene(),
        new RectScene(),
        new EllipseScene(),
        new PolygonScene(),
        new PolygramScene(),
        new LineGridScene(),
        new CameraScene(),
        new RowScene(),
        new ColumnScene(),
        new GridScene(),
        new ImageScene(),
        new VideoScene(),
        new PathScene(),
    ],
    theme: {
        bg: '#0D0F15',
        card: '#1e232b',
        primary: '#6990DD',
    },
});
