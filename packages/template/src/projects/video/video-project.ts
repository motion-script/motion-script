import { createProject } from '@motion-script/core';

import {
    VideoBasicScene,
    VideoFitScene,
    VideoCropScene,
    VideoFilteredScene,
    VideoBlendedScene,
} from './scenes';

/**
 * A project that walks through the video fill: a shape painted with a *playing*
 * video that advances its timestamp each frame. One scene per case — plain
 * playback, the fit/crop modes, a `MediaFilter` chain, and an opacity/blend
 * layer — to show video reuses every standard fill feature.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Video Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        new VideoBasicScene(),
        new VideoFitScene(),
        new VideoCropScene(),
        new VideoFilteredScene(),
        new VideoBlendedScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD',
    },
});
