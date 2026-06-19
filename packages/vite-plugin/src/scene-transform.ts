import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The `?scene` import suffix that marks a module as a hot-reloadable scene.
 *
 *   import intro from './scenes/intro?scene';
 *
 * Mirrors Motion Canvas's `?scene` convention. The suffix turns each scene file
 * into its own HMR boundary: editing it (or a helper it imports) swaps just that
 * scene into the running player without rebuilding the rest of the timeline.
 */
const SCENE_QUERY = '?scene';

/**
 * Build the wrapper module source for a `?scene` import.
 *
 * The wrapper imports the scene file's **default export** (a `Scene` subclass),
 * instantiates it once, stamps a stable `__sceneHotId` (the scene file's path
 * relative to the project root), and self-accepts HMR. On every (re)evaluation
 * — including hot updates triggered by editing the scene or a helper it imports
 * — it notifies the running player via `window.__motionScriptSceneHot`, which
 * routes the fresh instance to `PlaybackController.replaceScene` for an
 * in-place, no-flash swap.
 *
 * @param fileId   Absolute id of the underlying scene module (no query).
 * @param hotId    Stable scene identity (project-relative path).
 */
function wrapperSource(fileImport: string, hotId: string, sceneName: string): string {
    // JSON.stringify makes the import specifier, hot id, and name safe to inline
    // (handles Windows backslashes, quotes, etc.).
    const fileSpec = JSON.stringify(fileImport);
    const id = JSON.stringify(hotId);
    const name = JSON.stringify(sceneName);
    // A scene file's default export is the `createScene(...)` result — already a
    // Scene instance. The wrapper just stamps its identity (hot id + a readable
    // name derived from the filename) and wires HMR self-accept.
    return `
import scene from ${fileSpec};

scene.__sceneHotId = ${id};
scene.name = ${name};

if (import.meta.hot) {
    // Self-accept: an edit to this scene (or a helper it imports that has no
    // boundary of its own) stays local to this module instead of bubbling up to
    // a full page reload.
    import.meta.hot.accept();
    // Notify the running player so it can swap just this scene in place. Guarded
    // because the headless export path has no player mounted.
    if (typeof window !== 'undefined' && window.__motionScriptSceneHot) {
        window.__motionScriptSceneHot(scene);
    }
}

export default scene;
`;
}

/**
 * Turn a scene file's basename into a readable PascalCase name for the timeline
 * and error reporting: `rect-scene.tsx` → `RectScene`, `intro.tsx` → `Intro`.
 */
function sceneNameFromFile(fileId: string): string {
    const base = fileId.split(/[\\/]/).pop() ?? 'Scene';
    const stem = base.replace(/\.[^.]+$/, '');
    const pascal = stem
        .split(/[-_.\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return pascal || 'Scene';
}

/**
 * Vite plugin implementing the `?scene` import convention.
 *
 * Splits into two hooks:
 * - `resolveId` claims any specifier ending in `?scene`, resolves the bare file
 *   it points at (so Vite tracks the real module in the graph for HMR), and
 *   returns a synthetic id carrying both the resolved file and the query.
 * - `load` emits the wrapper module for that id.
 *
 * The wrapper's default export is a ready-to-use scene **instance** with a
 * stamped hot id, so a project can write `scenes: [intro, outro]` directly.
 *
 * @param projectRoot Absolute path used to derive each scene's stable hot id.
 */
export function sceneTransform(projectRoot: string): Plugin {
    return {
        name: 'vite-plugin-motion-script:scene',
        // Run before the React plugin so the wrapper (plain JS, no JSX) is the
        // module Vite sees for the `?scene` id; the underlying .tsx file still
        // goes through the normal React/esbuild pipeline via the wrapper's import.
        enforce: 'pre',

        async resolveId(source, importer) {
            if (!source.endsWith(SCENE_QUERY)) return null;
            const bare = source.slice(0, -SCENE_QUERY.length);
            // Resolve the real file through the normal resolver chain so relative
            // and aliased specifiers both work, and so Vite registers the file as
            // a dependency of this wrapper (drives HMR propagation).
            const resolved = await this.resolve(bare, importer, { skipSelf: true });
            if (!resolved) return null;
            // Keep the query on the resolved id so `load` can claim it; Vite's
            // module graph treats "<file>?scene" as its own node, distinct from a
            // plain import of the same file.
            return `${resolved.id}${SCENE_QUERY}`;
        },

        load(id) {
            if (!id.endsWith(SCENE_QUERY)) return null;
            const fileId = id.slice(0, -SCENE_QUERY.length).split('?')[0];
            // Import the underlying file as a filesystem-absolute specifier
            // (`/@fs/<abs>`): Vite's import-analysis resolves this form directly
            // to the on-disk module, instead of mis-normalizing a raw absolute
            // path into a non-existent `/src/...` server URL.
            const fileImport = '/@fs/' + fileId.replace(/\\/g, '/').replace(/^\/+/, '');
            // Stable hot id: the file path relative to the project root, POSIX
            // separators. Falls back to the absolute path if the file lives
            // outside the root (e.g. a shared scene imported across packages), so
            // the id is always stable and unique even then.
            const rel = path.relative(projectRoot, fileId);
            const hotId = rel && !rel.startsWith('..')
                ? rel.split(path.sep).join('/')
                : fileId.replace(/\\/g, '/');
            return wrapperSource(fileImport, hotId, sceneNameFromFile(fileId));
        },
    };
}
