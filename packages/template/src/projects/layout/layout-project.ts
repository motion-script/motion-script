import { createProject } from 'motion-script';

import global from './scenes/global';
import camera from './scenes/camera?scene';
import row from './scenes/row?scene';
import column from './scenes/column?scene';
import stack from './scenes/stack?scene';
import groupMorph from './scenes/group-morph?scene';
import rectWithChildren from './scenes/rect-with-children?scene';
import rectWithoutChildren from './scenes/rect-without-children?scene';
import nested from './scenes/nested?scene';
import grid from './scenes/grid?scene';
import flexNodes from './scenes/flex-nodes?scene';
import titleLayout from './scenes/title-layout?scene';
import random from './scenes/random?scene';
import context from './scenes/context?scene';
import stage from './scenes/stage';
import overlayVerify from './scenes/overlay-verify?scene';
import defaultSize from './scenes/default-size';

/**
 * A project that walks through the layout system, one scene per concept: the
 * three `group` modes (`row`, `column`, `stack`), animating between them, the
 * hug-vs-shape behaviour of a `Rect` with and without children, nested flex
 * composition, and building a grid out of nested rows.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Layout Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        defaultSize,
        overlayVerify,
        stage,
        global,
        camera,
        row,
        titleLayout,
        random,
        context,
        column,
        stack,
        groupMorph,
        rectWithChildren,
        rectWithoutChildren,
        nested,
        grid,
        flexNodes,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD'
        },
    },
});
