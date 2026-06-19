import { createProject } from '@motion-script/core';

import localSpace from './scenes/local-space?scene';
import parentSpace from './scenes/parent-space?scene';
import globalSpace from './scenes/global-space?scene';
import drawMask from './scenes/mask?scene';

/**
 * A project that exercises the draw-command API. Every scene paints one complex
 * silhouette assembled entirely from `Graphics` ops inside a custom node —
 * `rect` + `ellipse` + bezier `path`, with holes punched via `.cut()`.
 *
 * One scene per fill {@link FillSpace} (`local` / `parent` / `global`) shows the
 * same figure under each reference frame, plus a final scene that builds an
 * inline `.mask()/.applyMask()/.endMask()` scope from draw commands.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Draw Commands Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        localSpace,
        parentSpace,
        globalSpace,
        drawMask,
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD',
    },
});
