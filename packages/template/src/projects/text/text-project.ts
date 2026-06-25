import { createProject } from '@motion-script/core';

import typing from './scenes/typing?scene';
import fontStyling from './scenes/font-styling?scene';
import textAlign from './scenes/text-align?scene';
import autofitWrap from './scenes/autofit-wrap?scene';
import textOnPath from './scenes/text-on-path?scene';
import selectionBasics from './scenes/selection-basics?scene';
import selectionOverlap from './scenes/selection-overlap?scene';
import richTextNesting from './scenes/rich-text-nesting?scene';
import textPaint from './scenes/text-paint?scene';
import codeText from './scenes/code-text?scene';
import wrapBounds from './scenes/wrap-bounds';

/**
 * A project that walks through the breadth of the text-rendering API:
 * typing/erasing (`append`/`prepend`/`to({ text })`), font styling
 * (weight/style/tracking/leading), `textAlign` modes, `autofit` + `wrap`,
 * text-on-path, the selection API (`find`/`word`/`match`/`line`/`slice`/
 * `filter`/`words`, including overlapping selections), nested `RichText`
 * spans, combined fill/stroke/shadow paint, and the `Code` node's
 * syntax-aware editing.
 *
 * Not auto-run by the vite plugin (which discovers `src/project.ts`). To
 * preview it, point the `@motion-script/vite-plugin` `entry` option at this
 * file, or temporarily re-export it as the default from `src/project.ts`.
 */
export default createProject({
    name: 'Text Showcase',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        typing,
        fontStyling,
        textAlign,
        autofitWrap,
        textOnPath,
        selectionBasics,
        selectionOverlap,
        richTextNesting,
        textPaint,
        wrapBounds

    ],
    theme: {
        'bg': '#0D0F15',
        'card': '#161a21',
        'primary': '#6990DD',
    },
});
