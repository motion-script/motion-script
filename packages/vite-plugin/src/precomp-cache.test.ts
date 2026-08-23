import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrecompFileCache } from './precomp-cache';

/**
 * The invalidation contract, which is the only thing standing between this cache
 * and a silently wrong timeline.
 *
 * An entry survives exactly as long as every file it was derived from is
 * byte-identical. That set includes the project config (fps, viewport, theme) and
 * the scene's transitive imports, captured at write time — and it is
 * self-validating, because widening the set always means editing a file already
 * inside it.
 */

let root: string;

/** Write a file and return its absolute path. */
function write(rel: string, contents: string): string {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    return abs;
}

/**
 * A `SerializedScenePrecomp` as core produces one. The tables reconstruct this
 * whole shape on read, so tests must round-trip a realistic object rather than a
 * bare stub.
 */
function precomp(frameCount: number, over: Record<string, unknown> = {}) {
    return { format: 1, frameCount, audioRequests: [], assetRecords: [], lifespans: [], ...over };
}

const cacheDir = () => path.join(root, '.motion-script', 'precomp');
const cacheFile = (name: string) => path.join(cacheDir(), name);
/** True once the cache has actually persisted something. */
const cacheWritten = () => fs.existsSync(cacheFile('scenes.csv'));

/**
 * Writes are debounced, so drive timers rather than sleeping — the point is to
 * assert the file's contents, not to race them.
 */
function flushWrites(): void {
    vi.advanceTimersByTime(500);
}

beforeEach(() => {
    vi.useFakeTimers();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-precomp-cache-'));
});

afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
});

describe('PrecompFileCache', () => {
    it('serves an entry back when nothing it depended on has changed', () => {
        const scene = write('src/scenes/intro.tsx', 'export default 1');
        const project = write('src/project.ts', 'export default {}');

        const writer = new PrecompFileCache(root, '1.0.0', [project]);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene], precomp(42));
        flushWrites();

        // A fresh instance, as a later server start would build.
        const reader = new PrecompFileCache(root, '1.0.0', [project]);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({ 'src/scenes/intro.tsx': precomp(42) });
    });

    it('drops an entry when the scene itself changes', () => {
        const scene = write('src/scenes/intro.tsx', 'export default 1');
        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene], precomp(42));
        flushWrites();

        fs.writeFileSync(scene, 'export default 2');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('drops an entry when a transitive helper changes', () => {
        // The case that motivates recording the whole dependency list rather than
        // just the scene file: editing a helper changes what the scene renders and
        // how long it runs, with the scene file untouched.
        const scene = write('src/scenes/intro.tsx', 'import "./helper"');
        const helper = write('src/scenes/helper.ts', 'export const x = 1');

        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene, helper], precomp(42));
        flushWrites();

        fs.writeFileSync(helper, 'export const x = 2');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('drops an entry when a dependency is deleted outright', () => {
        const scene = write('src/scenes/intro.tsx', 'import "./helper"');
        const helper = write('src/scenes/helper.ts', 'export const x = 1');

        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene, helper], precomp(42));
        flushWrites();

        fs.rmSync(helper);

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('drops every entry when the project config changes', () => {
        // fps, viewport, theme and variables all live here, and every one of them
        // changes what a pass measures — so the config is an implicit dependency of
        // every scene, not just the ones that happen to import it.
        const project = write('src/project.ts', 'export default { fps: 30 }');
        const a = write('src/scenes/a.tsx', 'export default 1');
        const b = write('src/scenes/b.tsx', 'export default 2');

        const writer = new PrecompFileCache(root, '1.0.0', [project]);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/a.tsx', [a], precomp(1));
        writer.put('src/scenes/b.tsx', [b], precomp(2));
        flushWrites();

        fs.writeFileSync(project, 'export default { fps: 60 }');

        const reader = new PrecompFileCache(root, '1.0.0', [project]);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('keeps unrelated scenes when only one changes', () => {
        const a = write('src/scenes/a.tsx', 'export default 1');
        const b = write('src/scenes/b.tsx', 'export default 2');

        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/a.tsx', [a], precomp(1));
        writer.put('src/scenes/b.tsx', [b], precomp(2));
        flushWrites();

        fs.writeFileSync(a, 'export default 99');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        // Per-scene granularity is the point: editing one scene must not force the
        // whole project to be measured again.
        expect(reader.validEntries()).toEqual({ 'src/scenes/b.tsx': precomp(2) });
    });

    it('discards everything after an engine upgrade', () => {
        const scene = write('src/scenes/intro.tsx', 'export default 1');
        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene], precomp(42));
        flushWrites();

        // A new engine can legitimately produce different durations from identical
        // source, so entries must not survive the upgrade.
        const reader = new PrecompFileCache(root, '2.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('discards everything when the asset manifest changes', () => {
        const scene = write('src/scenes/intro.tsx', 'export default 1');
        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene], precomp(42));
        flushWrites();

        // Precomp is also where a missing asset is detected, so an entry must not
        // outlive a change to what's on disk.
        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m2');
        expect(reader.validEntries()).toEqual({});
    });

    it('ignores a corrupt or truncated cache rather than throwing', () => {
        fs.mkdirSync(cacheDir(), { recursive: true });
        fs.writeFileSync(cacheFile('meta.csv'), 'format,engine,manifest\n1,1.0.0,m1\n');
        fs.writeFileSync(cacheFile('scenes.csv'), 'scene,frameCount\nsrc/a.tsx,not-a-number\n');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('discards a scene whose dependency rows are missing', () => {
        // The tables are separate files, so a crash between writes can leave
        // scenes.csv ahead of deps.csv. An entry with nothing to validate against
        // could never be invalidated, so it must not be served.
        fs.mkdirSync(cacheDir(), { recursive: true });
        fs.writeFileSync(cacheFile('meta.csv'), 'format,engine,manifest\n1,1.0.0,m1\n');
        fs.writeFileSync(cacheFile('scenes.csv'), 'scene,frameCount\nsrc/a.tsx,10\n');
        fs.writeFileSync(cacheFile('deps.csv'), 'scene,path,hash\n');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('rejects a table whose columns have been reordered', () => {
        const scene = write('src/scenes/intro.tsx', 'export default 1');
        const writer = new PrecompFileCache(root, '1.0.0', []);
        writer.setManifestDigest('m1');
        writer.put('src/scenes/intro.tsx', [scene], precomp(42));
        flushWrites();

        // Reading columns positionally means a changed header is a changed meaning.
        // Better to re-measure than to read `endFrame` as `startFrame`.
        fs.writeFileSync(cacheFile('scenes.csv'), 'frameCount,scene\n42,src/scenes/intro.tsx\n');

        const reader = new PrecompFileCache(root, '1.0.0', []);
        reader.setManifestDigest('m1');
        expect(reader.validEntries()).toEqual({});
    });

    it('refuses to record a dependency outside the project', () => {
        const outside = path.join(os.tmpdir(), 'ms-outside-probe.ts');
        fs.writeFileSync(outside, 'export default 1');
        try {
            const writer = new PrecompFileCache(root, '1.0.0', []);
            writer.setManifestDigest('m1');
            // Every recorded dep is stored project-relative; one that escapes the
            // root has no stable relative form and is dropped. With nothing left to
            // validate against, the entry is not stored at all rather than stored
            // as permanently-fresh.
            writer.put('src/scenes/intro.tsx', [outside], precomp(42));
            flushWrites();
            expect(cacheWritten()).toBe(false);
        } finally {
            fs.rmSync(outside, { force: true });
        }
    });
});
