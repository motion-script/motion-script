import { createProject } from '@motion-script/core';

import videoBasic from './scenes/basic?scene';
import videoFit from './scenes/fit-mode?scene';
import videoCrop from './scenes/crop-mode?scene';
import videoFiltered from './scenes/filtered?scene';
import videoPosterized from './scenes/posterized?scene';
import videoEchoed from './scenes/echoed?scene';
import videoBlended from './scenes/blended?scene';
import videoNode from './scenes/video-node?scene';

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
        videoNode,
        videoBasic,
        videoFit,
        videoCrop,
        videoFiltered,
        videoPosterized,
        videoEchoed,
        videoBlended,
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD',
    },
});
