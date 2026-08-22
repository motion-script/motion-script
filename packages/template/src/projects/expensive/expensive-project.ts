import { createProject, createScene } from 'motion-script';

import { expensive } from '../../scenes/expensive';

/**
 * Stress-test project for the abortable-seek + scrub-debounce work.
 *
 * Two near-identical heavy scenes (each ~1200 continuously-animated rects).
 * Scrub the playhead backward deep inside a scene to feel the difference: the
 * evaluator has to replay from frame 0 to the target, so without abort/debounce
 * a fast backward drag freezes the UI; with them it stays responsive.
 *
 * Not auto-run — re-export it as the default from `src/project.ts` to render it.
 */
export default createProject({
    name: 'Expensive (scrub stress test)',
    fps: 60,
    viewport: {
        width: 1920,
        height: 1080,
    },
    scenes: [
        // 4 legs × 2.5s at 60fps ≈ 600 frames per scene, so a backward scrub deep
        // in a scene has a long replay-from-zero to chew through.
        createScene(expensive({ seed: 'scene-a', fill: '#e8c584' })),
        createScene(expensive({ seed: 'scene-b', fill: '#7fb3c8' })),
    ],
});
