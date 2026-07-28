import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ViteDevServer } from 'vite';
import type { IncomingMessage } from 'node:http';
import { TABLES, encodeCache, decodeCache, type CacheEntry, type DepHash } from './precomp-csv';

/**
 * A project-local store of what the engine's precomp pass discovered, so an
 * unchanged scene never has to be measured twice.
 *
 * Precomp drives every scene's generator to completion to learn its duration,
 * asset windows, audio and node lifespans. For a ten-minute project that is tens
 * of thousands of frames of work, repeated on every cold start, every CLI
 * invocation and every CI render — and it produces the identical answer each
 * time, because scene evaluation is deterministic by design.
 *
 * This module persists those answers to `<project>/.motion-script/precomp.json`
 * and decides which ones are still valid. Core owns the *shape* (see
 * `serializeScenePrecomp` there); this owns *where* and *when*.
 *
 * ── Why the entry carries its own dependency list ──────────────────────────────
 *
 * Validity means "nothing this pass depended on has changed". The obvious way to
 * check that is to walk the scene's import graph — but Vite's module graph is
 * populated lazily by transforms, so on a cold start it is empty, which is
 * exactly when we need it.
 *
 * So each entry records the files it was derived from, captured at *write* time
 * (when the graph is warm, because the browser has just run the scene). Checking
 * validity later is then pure filesystem work: re-hash the recorded files.
 *
 * This is airtight rather than merely convenient, because the dependency set can
 * only grow by editing a file already inside it: adding an import to a scene
 * changes that scene's own source, and its hash is in the list. A new transitive
 * dependency is therefore always announced by a hash change on a file we already
 * track — there is no way to widen the graph invisibly.
 */

/** Bump when the on-disk shape changes; older files are discarded, not reinterpreted. */
const CACHE_FORMAT = 1;

const CACHE_DIR = '.motion-script';
/** Subdirectory holding the CSV tables; see `precomp-csv.ts` for the layout. */
const CACHE_SUBDIR = 'precomp';

/** POST route the running player reports finished scene passes to. */
export const PRECOMP_ENDPOINT = '/__motion-script/precomp';

/** Virtual module the player imports to receive the validated entries. */
export const PRECOMP_CACHE_ID = '~precomp-cache';
export const RESOLVED_PRECOMP_CACHE_ID = '\0~precomp-cache';

/**
 * The manifest digest recorded alongside the entries.
 *
 * Deliberately project-wide rather than per-asset. Scoping it to the assets an
 * entry referenced would be more precise, but asset keys are not uniformly
 * manifest paths — a font is tracked by *family* — so a per-asset lookup would
 * silently never match for those and quietly disable caching for any scene with
 * text. A single digest is coarse (adding an unrelated image re-measures the
 * project once) but it cannot be subtly wrong.
 *
 * Load-bearing beyond freshness: the precomp pass is also where a missing asset
 * is *detected* — the tracker throws and it surfaces as a build error — so an
 * entry must not outlive a change to what is on disk.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

function hashContent(buf: Buffer | string): string {
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** Hash a file's bytes, or `null` if it no longer exists (which invalidates the entry). */
function hashFile(abs: string): string | null {
    try {
        return hashContent(fs.readFileSync(abs));
    } catch {
        return null;
    }
}

/**
 * Store for one user project.
 *
 * Reads are eager (once, at server start) and cheap: the whole point is that a
 * cold start pays a few file hashes rather than a full precomp. Writes are
 * debounced, because a project publishes one entry per scene as it measures them.
 */
export class PrecompFileCache {
    private readonly dir: string;
    private entries = new Map<string, CacheEntry>();
    private writeTimer: NodeJS.Timeout | null = null;
    private dirty = false;
    /** Manifest digest the loaded entries were written against. */
    private loadedManifest: string | null = null;
    /** Manifest digest of the current run, set by {@link setManifestDigest}. */
    private manifestDigest: string | null = null;

    constructor(
        private readonly userRoot: string,
        private readonly engineVersion: string,
        /**
         * Extra files every entry implicitly depends on — the project config,
         * where fps, viewport, theme and variables live. A change there alters
         * every scene's pass, so it belongs in every entry's dependency list.
         */
        private readonly projectFiles: string[] = [],
    ) {
        this.dir = path.join(userRoot, CACHE_DIR, CACHE_SUBDIR);
        this.load();
    }

    private load(): void {
        const files: Record<string, string> = {};
        for (const table of Object.values(TABLES)) {
            try {
                files[table.file] = fs.readFileSync(path.join(this.dir, table.file), 'utf8');
            } catch {
                // Absent or unreadable. `decodeCache` treats every table but meta and
                // scenes as optional, and drops any scene left without dependency
                // rows — so a partially-written set degrades to a re-measure.
                files[table.file] = '';
            }
        }

        const contents = decodeCache(CACHE_FORMAT, files);
        if (!contents || contents.engine !== this.engineVersion) return;

        this.loadedManifest = contents.manifest;
        this.entries = contents.entries;
    }

    /**
     * Tell the cache what the asset manifest currently digests to. Entries loaded
     * against a different manifest are dropped — see {@link CacheFile.manifest}.
     */
    setManifestDigest(digest: string): void {
        this.manifestDigest = digest;
        if (this.loadedManifest !== null && this.loadedManifest !== digest) {
            this.entries.clear();
            this.loadedManifest = digest;
        }
    }

    /**
     * The entries whose recorded dependencies all still hash the same, as a plain
     * `{ [sceneHotId]: SerializedScenePrecomp }` map ready to hand to the browser.
     *
     * Validation happens here, in Node, so the runtime never has to judge whether
     * an entry is fresh — it simply uses what it is handed.
     */
    validEntries(): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of this.entries) {
            if (!this.isValid(entry)) continue;
            out[key] = entry.precomp;
        }
        return out;
    }

    private isValid(entry: CacheEntry): boolean {
        // An entry with no recorded dependencies could never be invalidated, so
        // treat it as unusable rather than eternally fresh.
        if (entry.deps.length === 0) return false;
        for (const [rel, hash] of entry.deps) {
            const abs = this.resolveInsideRoot(rel);
            if (!abs || hashFile(abs) !== hash) return false;
        }
        return true;
    }

    /**
     * Record a finished pass for `sceneHotId`.
     *
     * @param deps    Absolute paths of the source files the pass derived from.
     * @param precomp A `SerializedScenePrecomp` from core.
     */
    put(sceneHotId: string, deps: string[], precomp: unknown): void {
        if (!isRecord(precomp)) return;

        const hashed: DepHash[] = [];
        for (const abs of new Set([...deps, ...this.projectFiles])) {
            const rel = this.relativeInsideRoot(abs);
            if (!rel) continue;
            const hash = hashFile(abs);
            if (hash) hashed.push([rel, hash]);
        }
        if (hashed.length === 0) return;
        // Sorted so the files are stable across runs and diff cleanly if committed.
        hashed.sort((a, b) => a[0].localeCompare(b[0]));

        this.entries.set(sceneHotId, { deps: hashed, precomp });
        this.scheduleWrite();
    }

    /**
     * Coalesce the burst of per-scene writes a project produces as it measures
     * into a single pass over the tables, and never let a failed write take the
     * server down — a cache that cannot persist should cost speed, never
     * correctness.
     */
    private scheduleWrite(): void {
        this.dirty = true;
        if (this.writeTimer) return;
        this.writeTimer = setTimeout(() => {
            this.writeTimer = null;
            if (!this.dirty) return;
            this.dirty = false;
            // Without a digest we cannot say what the entries were measured
            // against, and an entry that can't be invalidated is worse than none.
            if (this.manifestDigest === null) return;
            try {
                const files = encodeCache(CACHE_FORMAT, {
                    engine: this.engineVersion,
                    manifest: this.manifestDigest,
                    entries: this.entries,
                });
                fs.mkdirSync(this.dir, { recursive: true });
                for (const [name, contents] of Object.entries(files)) {
                    // Write-then-rename per table, so a crash mid-write leaves the
                    // previous file intact rather than a truncated one. Across
                    // tables the set can still land half-updated; `decodeCache`
                    // drops any scene missing dependency rows, so the worst case is
                    // a re-measure rather than a mismatched entry.
                    const target = path.join(this.dir, name);
                    const tmp = `${target}.tmp`;
                    fs.writeFileSync(tmp, contents);
                    fs.renameSync(tmp, target);
                }
            } catch (err) {
                console.warn('[motion-script] could not write the precomp cache:', err);
            }
        }, 250);
        this.writeTimer.unref?.();
    }

    /** Resolve a project-relative path, refusing anything that escapes the project. */
    private resolveInsideRoot(rel: string): string | null {
        const abs = path.resolve(this.userRoot, rel);
        return this.relativeInsideRoot(abs) ? abs : null;
    }

    private relativeInsideRoot(abs: string): string | null {
        const rel = path.relative(this.userRoot, abs);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
        return rel.split(path.sep).join('/');
    }
}

/**
 * Collect the user-source files a scene module reaches, from Vite's module graph.
 *
 * Only called on the write path, where the graph is guaranteed warm: the browser
 * has just imported and run this scene, so every module it touches has been
 * transformed and registered.
 *
 * Dependencies outside the project (`node_modules`, the plugin's own virtual
 * modules) are skipped — those move with the engine version, which every entry is
 * already keyed by.
 */
export function collectSceneDeps(server: ViteDevServer, sceneFile: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    // Vite keys its file→modules map by POSIX-separated paths, so a Windows
    // `path.resolve` result never matches and the walk silently finds nothing.
    // Normalizing is what makes the traversal work at all on Windows.
    const queue = [posix(sceneFile)];

    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);

        if (file.includes('\0') || file.includes('node_modules')) continue;
        if (!fs.existsSync(file)) continue;
        out.push(file);

        // `getModulesByFile`, not `getModuleById`: one file can have several nodes
        // in the graph — the bare module, the `?scene` wrapper, a `?t=` cache-bust
        // — and its imports may hang off any of them. Looking the file up by id
        // alone finds one node and silently misses the rest, which would leave real
        // dependencies out of the recorded list and let an edit to a helper go
        // undetected. Traversing by `.file` also sidesteps query handling entirely.
        for (const mod of server.moduleGraph.getModulesByFile(file) ?? []) {
            for (const imported of mod.importedModules) {
                if (imported.file) queue.push(posix(imported.file));
            }
        }
    }
    return out;
}

/** Path with POSIX separators, matching how Vite keys its module graph. */
function posix(p: string): string {
    return p.replace(/\\/g, '/');
}

/**
 * Read a JSON request body, bounded so a malformed or hostile request cannot grow
 * unboundedly in memory.
 */
export function readJsonBody(
    req: IncomingMessage,
    limitBytes = 32 * 1024 * 1024,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('precomp cache payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

/** Stable digest of one manifest entry, used to detect a changed or removed asset. */
export function digestManifestEntry(entry: unknown): string {
    return hashContent(JSON.stringify(entry ?? null));
}
