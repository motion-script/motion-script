import { createProject } from '@motion-script/core';
import { scenes } from './scenes/catalog';

/**
 * The e2e visual-test project: one scene per TESTS.md checkbox, rendered at
 * 960x540 (Quarter HD) / 30 fps as specified by TESTS.md. The screenshot
 * harness captures the first, mid, and last frame of each scene and pixel-diffs
 * the stable-build render against the live-library render.
 *
 * The `scenes` array is auto-generated from TESTS.md by `pnpm gen`
 * (scripts/gen-scenes.ts) — see src/scenes/catalog.ts.
 */
export default createProject({
    name: 'Motion Script E2E',
    fps: 30,
    viewport: {
        width: 960,
        height: 540,
    },
    theme: {
        colors: {
            bg: '#0d0f15',
            card: '#161a21',
            primary: '#6990dd',
            accent: '#e8617c',
        },
    },
    scenes,
});
