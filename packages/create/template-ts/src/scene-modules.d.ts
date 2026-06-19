/**
 * Type for the `?scene` import suffix handled by `@motion-script/vite-plugin`.
 *
 *   import intro from './scenes/intro?scene';
 *
 * The plugin turns each scene file into its own hot-reload boundary and yields a
 * ready-to-use `Scene` instance as the default export, so projects can write
 * `scenes: [intro, outro]` directly.
 */
declare module '*?scene' {
    import type { Scene } from '@motion-script/core';
    const scene: Scene;
    export default scene;
}
