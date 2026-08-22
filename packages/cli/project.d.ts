/**
 * Ambient types for the module conventions `@motion-script/cli` adds to a
 * project. Reference it once from a project's `motion-script.d.ts`:
 *
 *   /// <reference types="@motion-script/cli/project" />
 *
 * The `?scene` import suffix is handled by the CLI's `scene-transform`:
 *
 *   import intro from './scenes/intro?scene';
 *
 * Each scene file becomes its own module boundary and yields a ready-to-use
 * `Scene` instance as the default export, so projects can write
 * `scenes: [intro, outro]` directly.
 */
declare module '*?scene' {
    import type { Scene } from '@motion-script/core';
    const scene: Scene;
    export default scene;
}
