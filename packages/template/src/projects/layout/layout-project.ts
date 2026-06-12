import { createProject } from '@motion-script/core';

import {
    RowScene,
    ColumnScene,
    StackScene,
    GroupMorphScene,
    RectWithChildrenScene,
    RectWithoutChildrenScene,
    NestedScene,
    GridScene,
    FlexNodesScene,
} from './scenes';

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
        new RowScene(),
        new ColumnScene(),
        new StackScene(),
        new GroupMorphScene(),
        new RectWithChildrenScene(),
        new RectWithoutChildrenScene(),
        new NestedScene(),
        new GridScene(),
        new FlexNodesScene(),
    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD'
    },
});
