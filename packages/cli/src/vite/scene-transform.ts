import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The `?scene` import suffix that marks a module as a scene.
 *
 *   import intro from './scenes/intro?scene';
 *
 * Mirrors Motion Canvas's `?scene` convention. The suffix gives each scene file
 * its own module boundary, and stamps it with a stable identity the precomp
 * cache keys on.
 */
const SCENE_QUERY = '?scene';

/**
 * Build the wrapper module source for a `?scene` import.
 *
 * The wrapper imports the scene file's **default export** (already a `Scene`
 * instance), stamps a stable `__sceneHotId` — the scene file's path relative to
 * the project root, which is the key the precomp cache stores passes under — and
 * a readable name derived from the filename.
 *
 * @param fileId   Absolute id of the underlying scene module (no query).
 * @param hotId    Stable scene identity (project-relative path).
 */
function wrapperSource(fileImport: string, hotId: string, sceneName: string): string {
    // JSON.stringify makes the import specifier, scene id, and name safe to
    // inline (handles Windows backslashes, quotes, etc.).
    const fileSpec = JSON.stringify(fileImport);
    const id = JSON.stringify(hotId);
    const name = JSON.stringify(sceneName);
    // A scene file's default export is the `createScene(...)` result — already a
    // Scene instance. The wrapper just stamps its identity: the id the precomp
    // cache keys on, plus a readable name derived from the filename.
    return `
import scene from ${fileSpec};

scene.__sceneHotId = ${id};
scene.name = ${name};

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
 *   it points at (so Vite tracks the real module in the graph, which is what
 *   `collectSceneDeps` walks to hash a cached pass's dependencies), and returns
 *   a synthetic id carrying both the resolved file and the query.
 * - `load` emits the wrapper module for that id.
 *
 * The wrapper's default export is a ready-to-use scene **instance** with a
 * stamped id, so a project can write `scenes: [intro, outro]` directly.
 *
 * @param projectRoot Absolute path used to derive each scene's stable id.
 */
export function sceneTransform(projectRoot: string): Plugin {
    return {
        name: 'motion-script:scene',
        // Claim the `?scene` id before any other plugin can, so the wrapper
        // (plain JS, no JSX) is the module Vite sees for it; the underlying .tsx
        // still goes through the normal transform via the wrapper's import.
        enforce: 'pre',

        async resolveId(source, importer) {
            if (!source.endsWith(SCENE_QUERY)) return null;
            const bare = source.slice(0, -SCENE_QUERY.length);
            // Resolve the real file through the normal resolver chain so relative
            // and aliased specifiers both work, and so Vite registers the file as
            // a dependency of this wrapper.
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
            // Stable scene id: the file path relative to the project root, POSIX
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
