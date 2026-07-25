import fs from 'node:fs';
import type { Plugin } from 'vite';
import { parseCSV } from '@motion-script/core';

/**
 * The `?csv` import suffix that reads a CSV file and parses it into row
 * records at build/transform time:
 *
 *   import data from './data/sales.csv?csv';
 *
 * `data` resolves synchronously to `Record<string, string | number>[]` — no
 * `fetch`, no `await`, no asset-manifest entry. CSV is *data* that shapes a
 * scene's node tree (chart series, table rows, …), not decodable media like an
 * image or video, so it never goes through the runtime asset pipeline
 * (`AssetTracker`/`AssetManager`): scene generators step synchronously frame
 * by frame and can't `await` mid-build, so by the time a scene's `stage.add`
 * runs, the data has to already be a plain array. This suffix does that
 * parsing once, up front, the same way a plain `import data from './data.json'`
 * would.
 */
const CSV_QUERY = '?csv';

/**
 * Vite plugin implementing the `?csv` import convention. Mirrors
 * {@link sceneTransform}'s two-hook shape: `resolveId` claims the suffixed
 * specifier and resolves the real file (so relative/aliased paths and Vite's
 * dependency graph both work), `load` reads and parses it.
 */
export function csvTransform(): Plugin {
    return {
        name: 'vite-plugin-motion-script:csv',

        async resolveId(source, importer) {
            if (!source.endsWith(CSV_QUERY)) return null;
            const bare = source.slice(0, -CSV_QUERY.length);
            const resolved = await this.resolve(bare, importer, { skipSelf: true });
            if (!resolved) return null;
            return `${resolved.id}${CSV_QUERY}`;
        },

        load(id) {
            if (!id.endsWith(CSV_QUERY)) return null;
            const fileId = id.slice(0, -CSV_QUERY.length);

            // Register the source file as a dependency so editing it invalidates
            // this module (dev HMR and `vite build --watch` alike), even though
            // it's read directly off disk rather than through an `import`.
            this.addWatchFile(fileId);

            const text = fs.readFileSync(fileId, 'utf8');
            const records = parseCSV(text);
            return `export default ${JSON.stringify(records)};`;
        },
    };
}
