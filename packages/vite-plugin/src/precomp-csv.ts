import { toCsv, parseCsv } from './csv';

/**
 * The precomp cache's on-disk shape: a handful of CSV tables rather than one
 * JSON document.
 *
 * What a scene's pass records is overwhelmingly row-shaped — one entry per source
 * dependency, per node lifespan, per referenced asset, per audio clip — and JSON
 * repeats every field name on every one of those rows. Splitting them into tables
 * names each column once, which makes the files far smaller, readable at a glance,
 * greppable, and line-diffable for projects that choose to commit them.
 *
 * Core stays format-agnostic: it produces a plain `SerializedScenePrecomp` and
 * validates one on the way back in. This module is the only place that knows that
 * object can be laid out as rows, and it reassembles exactly the same shape on
 * read so core's validation still runs unchanged.
 */

/** One table's filename and column names. */
interface Table {
    file: string;
    header: readonly string[];
}

/**
 * `scenes.csv` assigns each scene a small integer id; every other table refers to
 * it by that id rather than repeating the path.
 *
 * Scene keys are full project-relative paths — around forty characters — and the
 * row tables carry one entry per node lifespan, which is by far the bulk of the
 * cache. Repeating the path on every one of those rows made the tables larger
 * than the JSON they replaced. Normalizing it out is what actually makes the
 * format smaller, and `scenes.csv` keeps the mapping in plain sight so the files
 * stay readable on their own.
 */
export const TABLES = {
    meta: { file: 'meta.csv', header: ['format', 'engine', 'manifest'] },
    scenes: { file: 'scenes.csv', header: ['sceneId', 'scene', 'frameCount'] },
    deps: { file: 'deps.csv', header: ['sceneId', 'path', 'hash'] },
    lifespans: { file: 'lifespans.csv', header: ['sceneId', 'path', 'startFrame', 'endFrame'] },
    assets: {
        file: 'assets.csv',
        header: [
            'sceneId', 'key', 'type', 'src', 'startFrame', 'endFrame',
            'width', 'height', 'trimStart', 'trimEnd', 'fontFamily', 'fontWeight',
        ],
    },
    audio: {
        file: 'audio.csv',
        header: [
            'sceneId', 'id', 'src', 'startAt', 'endAt', 'trimStart', 'volume',
            'loop', 'open', 'mediaDuration', 'ownerPath', 'filters',
        ],
    },
} satisfies Record<string, Table>;

/** A file the pass depended on, with the hash it had when the pass ran. */
export type DepHash = [relPath: string, hash: string];

/** One scene's cached pass: its dependency fingerprints plus core's serialized precomp. */
export interface CacheEntry {
    deps: DepHash[];
    /** A `SerializedScenePrecomp` from core. Reassembled on read, validated by core. */
    precomp: Record<string, unknown>;
}

export interface CacheContents {
    engine: string;
    manifest: string;
    entries: Map<string, CacheEntry>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read a cell as a number, or `undefined` when blank or not numeric. */
function num(cell: string | undefined): number | undefined {
    if (cell === undefined || cell === '') return undefined;
    const n = Number(cell);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * `trimEnd` is legitimately unbounded for an untrimmed clip. Core encodes that as
 * the literal string `"Infinity"` (JSON has no such number) and decodes it back,
 * so pass the marker through untouched rather than coercing it to a number here.
 */
function trim(cell: string | undefined): number | string | undefined {
    if (cell === undefined || cell === '') return undefined;
    return cell === 'Infinity' ? 'Infinity' : num(cell);
}

function str(cell: string | undefined): string | undefined {
    return cell === undefined || cell === '' ? undefined : cell;
}

/** Set `key` on `out` only when `value` is present, so absent stays absent. */
function put(out: Record<string, unknown>, key: string, value: unknown): void {
    if (value !== undefined) out[key] = value;
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/** Render the whole cache as `{ filename: contents }`, ready to write. */
export function encodeCache(
    format: number,
    contents: CacheContents,
): Record<string, string> {
    const sceneRows: unknown[][] = [];
    const depRows: unknown[][] = [];
    const lifespanRows: unknown[][] = [];
    const assetRows: unknown[][] = [];
    const audioRows: unknown[][] = [];

    // Sorted so the files are byte-stable across runs: an unchanged project must
    // produce an unchanged cache, or committing it would churn every diff. The
    // sort also fixes the id assignment, so ids stay put between runs too.
    const scenes = [...contents.entries].sort((a, b) => a[0].localeCompare(b[0]));

    scenes.forEach(([scene, entry], id) => {
        const p = entry.precomp;
        sceneRows.push([id, scene, p.frameCount]);

        for (const [dep, hash] of entry.deps) depRows.push([id, dep, hash]);

        for (const pair of asPairs(p.lifespans)) {
            const span = isRecord(pair[1]) ? pair[1] : {};
            lifespanRows.push([id, pair[0], span.startFrame, span.endFrame]);
        }

        for (const pair of asPairs(p.assetRecords)) {
            const r = isRecord(pair[1]) ? pair[1] : {};
            assetRows.push([
                id, pair[0], r.type, r.src, r.startFrame, r.endFrame,
                r.width, r.height, r.trimStart, r.trimEnd, r.fontFamily, r.fontWeight,
            ]);
        }

        for (const req of Array.isArray(p.audioRequests) ? p.audioRequests : []) {
            if (!isRecord(req)) continue;
            audioRows.push([
                id, req.id, req.src, req.startAt, req.endAt, req.trimStart, req.volume,
                req.loop, req.open, req.mediaDuration, req.ownerPath,
                // Filters are the one genuinely nested field — a chain of typed
                // objects. Rare enough that a JSON cell is a better trade than
                // another table keyed back to the request.
                req.filters === undefined ? '' : JSON.stringify(req.filters),
            ]);
        }
    });

    return {
        [TABLES.meta.file]: toCsv(TABLES.meta.header, [[format, contents.engine, contents.manifest]]),
        [TABLES.scenes.file]: toCsv(TABLES.scenes.header, sceneRows),
        [TABLES.deps.file]: toCsv(TABLES.deps.header, depRows),
        [TABLES.lifespans.file]: toCsv(TABLES.lifespans.header, lifespanRows),
        [TABLES.assets.file]: toCsv(TABLES.assets.header, assetRows),
        [TABLES.audio.file]: toCsv(TABLES.audio.header, audioRows),
    };
}

function asPairs(value: unknown): [string, unknown][] {
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is [string, unknown] => Array.isArray(p) && p.length === 2);
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/**
 * Rebuild the cache from `{ filename: contents }`, or `null` when it isn't a
 * readable cache of `format`.
 *
 * Every table is optional except `meta` and `scenes`: a scene with no assets or
 * no audio simply has no rows. A scene that ends up with no dependency rows is
 * dropped, which is what makes a partial write safe — the tables are written as
 * separate files, so a crash between them can leave `scenes.csv` ahead of
 * `deps.csv`, and an entry with nothing to validate against must never be served.
 */
export function decodeCache(format: number, files: Record<string, string>): CacheContents | null {
    const metaRows = parseCsv(files[TABLES.meta.file] ?? '', TABLES.meta.header);
    const meta = metaRows[0];
    if (!meta || Number(meta[0]) !== format) return null;
    const [, engine, manifest] = meta;
    if (!engine || !manifest) return null;

    const entries = new Map<string, CacheEntry>();
    /** Scene id → the entry it names, so the row tables can resolve their `sceneId`. */
    const byId = new Map<string, CacheEntry>();

    for (const [sceneId, scene, frameCount] of parseCsv(files[TABLES.scenes.file] ?? '', TABLES.scenes.header)) {
        const frames = num(frameCount);
        if (!scene || sceneId === '' || frames === undefined) continue;
        const entry: CacheEntry = {
            deps: [],
            precomp: {
                // Core stamps its own format on what it serialized; echo it back so
                // its validator sees the shape it expects.
                format,
                frameCount: frames,
                audioRequests: [],
                assetRecords: [],
                lifespans: [],
            },
        };
        entries.set(scene, entry);
        byId.set(sceneId, entry);
    }

    for (const [sceneId, dep, hash] of parseCsv(files[TABLES.deps.file] ?? '', TABLES.deps.header)) {
        if (dep && hash) byId.get(sceneId)?.deps.push([dep, hash]);
    }

    for (const [sceneId, nodePath, start, end] of parseCsv(files[TABLES.lifespans.file] ?? '', TABLES.lifespans.header)) {
        const entry = byId.get(sceneId);
        if (!entry) continue;
        // The scene root's structural path is the empty string, so a blank cell
        // here is meaningful data rather than a missing value.
        (entry.precomp.lifespans as unknown[]).push([nodePath ?? '', { startFrame: num(start), endFrame: num(end) }]);
    }

    for (const row of parseCsv(files[TABLES.assets.file] ?? '', TABLES.assets.header)) {
        const [sceneId, key, type, src, startFrame, endFrame, width, height, trimStart, trimEnd, fontFamily, fontWeight] = row;
        const entry = byId.get(sceneId);
        if (!entry || !key) continue;
        const record: Record<string, unknown> = { type, src, startFrame: num(startFrame), endFrame: num(endFrame) };
        put(record, 'width', num(width));
        put(record, 'height', num(height));
        put(record, 'trimStart', num(trimStart));
        put(record, 'trimEnd', trim(trimEnd));
        put(record, 'fontFamily', str(fontFamily));
        put(record, 'fontWeight', num(fontWeight));
        (entry.precomp.assetRecords as unknown[]).push([key, record]);
    }

    for (const row of parseCsv(files[TABLES.audio.file] ?? '', TABLES.audio.header)) {
        const [sceneId, id, src, startAt, endAt, trimStart, volume, loop, open, mediaDuration, ownerPath, filters] = row;
        const entry = byId.get(sceneId);
        if (!entry) continue;
        const req: Record<string, unknown> = {
            id, src,
            startAt: num(startAt), endAt: num(endAt),
            trimStart: num(trimStart), volume: num(volume),
            loop: loop === 'true',
        };
        if (open === 'true') req.open = true;
        put(req, 'mediaDuration', num(mediaDuration));
        put(req, 'ownerPath', str(ownerPath));
        if (filters) {
            try {
                req.filters = JSON.parse(filters);
            } catch {
                // A filter chain we can't read means we can't reproduce the clip's
                // sound. Blank the entry's deps so the validity check below drops
                // it, rather than serving a pass that would play the clip dry.
                entry.deps.length = 0;
                continue;
            }
        }
        (entry.precomp.audioRequests as unknown[]).push(req);
    }

    for (const [scene, entry] of entries) {
        if (entry.deps.length === 0) entries.delete(scene);
    }

    return { engine, manifest, entries };
}
