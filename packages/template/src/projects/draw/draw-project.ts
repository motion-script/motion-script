import { createProject } from 'motion-script';

import localSpace from './scenes/local-space?scene';
import parentSpace from './scenes/parent-space?scene';
import globalSpace from './scenes/global-space?scene';
import drawMask from './scenes/mask?scene';
import drawPivot from './scenes/pivot?scene';
import drawPivotText from './scenes/pivot-text?scene';
import drawShapePivot from './scenes/shape-pivot?scene';
import drawTextAlignment from './scenes/draw-pivot-text?scene';
import randomNode from './scenes/random-node?scene';
import smithChart from './scenes/smith-chart?scene';

/**
 * A project that exercises the draw-command API. Every scene paints one complex
 * silhouette assembled entirely from `Graphics2D` ops inside a custom node —
 * `rect` + `ellipse` + bezier `path`, with holes punched via `.cut()`.
 *
 * One scene per fill {@link FillSpace} (`local` / `parent` / `global`) shows the
 * same figure under each reference frame, a scene that builds an inline
 * `.mask()/.applyMask()/.endMask()` scope from draw commands, and a final scene
 * that rotates a drawn union about an explicit graphics-level **pivot** (the
 * `center` arg to `Graphics2D.rotation`), a companion scene that pivots drawn
 * **text** — which, lacking measurable union bounds, can only be steered by an
 * explicit pivot — and a scene that turns a single rect about a **per-shape**
 * pivot (the `pivot` passed inside `Graphics2D.rect(...)`, distinct from the
 * union-level `center`).
 *
 * Not auto-run by `ms` (which discovers `src/project.ts`). To render it,
 * temporarily re-export it as the default from `src/project.ts`.
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
        drawPivot,
        drawPivotText,
        drawShapePivot,
        drawTextAlignment,
        randomNode,
        smithChart,
    ],
    theme: {
        colors: {
            'bg': '#0D0F15',
            'card': '#161a21',
            'primary': '#6990DD',
        },
    },
});
