/**
 * Ambient types for the features `@motion-script/vite-plugin` adds to a
 * project. Reference it once from a project's `motion-script.d.ts`:
 *
 *   /// <reference types="@motion-script/vite-plugin/project" />
 *
 * The `?scene` import suffix is handled by the plugin's `scene-transform`:
 *
 *   import intro from './scenes/intro?scene';
 *
 * Each scene file becomes its own hot-reload boundary and yields a ready-to-use
 * `Scene` instance as the default export, so projects can write
 * `scenes: [intro, outro]` directly.
 */
declare module '*?scene' {
    import type { Scene } from '@motion-script/core';
    const scene: Scene;
    export default scene;
}

/**
 * The `?csv` import suffix, handled by the plugin's `csv-transform`, parses a
 * CSV file into row records at build time:
 *
 *   import data from './data/sales.csv?csv';
 *
 * `data` is ready to use immediately — no loading, no await.
 */
declare module '*?csv' {
    import type { CSVRecord } from '@motion-script/core';
    const records: CSVRecord[];
    export default records;
}
