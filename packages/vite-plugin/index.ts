/**
 * Public entry point for `@motion-script/vite-plugin`.
 *
 * Kept as a thin barrel so the package's export surface stays stable and
 * minimal — the actual plugin implementation lives in `src/plugin.ts`.
 */
export { default, type MotionScriptOptions } from './src/plugin';
