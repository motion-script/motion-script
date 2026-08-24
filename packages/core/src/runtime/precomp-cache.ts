import { AudioRequest } from "@/attributes/audio/request";
import { filtersKey } from "@/attributes/audio/filters/union";
import { AssetRecord } from "@/assets/record";
import type { NodeLifespan, ScenePrecomp } from "./precompisition";

/**
 * Converting a {@link ScenePrecomp} to and from plain JSON, so a host can persist
 * what a build pass discovered and skip re-running it.
 *
 * Precomp is expensive and, for an unchanged scene, entirely redundant: driving a
 * ten-minute project's generators to completion produces the same frame counts,
 * asset windows, audio and lifespans every time. That reproducibility is not an
 * assumption this module introduces — it is an existing engine invariant (seeded
 * RNG rewound by `CanvasStage.reset()`, no wall-clock or `Math.random` anywhere in
 * the evaluation path), and it is the same property that lets a backward scrub
 * replay a scene and land on an identical frame.
 *
 * Core stays host-agnostic: this module only defines the shape. Deciding *where*
 * the bytes live and *when* an entry is still valid belongs to the host — see
 * `@motion-script/vite-plugin`, which keys entries by scene and invalidates them
 * by re-hashing each entry's recorded source dependencies.
 *
 * ### What is deliberately not stored
 *
 * - **`startFrame`** — a scene's global offset depends on the scenes before it,
 *   so it is re-derived by `assembleTimeline` on every assembly. Caching it would
 *   be caching a fact about the *project*, not about the scene.
 * - **`PrecompResult.assets`** — derived from the per-scene records by
 *   `buildAssetMap`, including lead/evict windows that depend on fps. Recomputed.
 * - **`measured`** — always true for a cached entry, by definition.
 */

/**
 * Wire-format version. Bump on any change to the serialized shape; entries
 * written by a different version are rejected rather than reinterpreted.
 */
export const PRECOMP_CACHE_FORMAT = 1;

/** A {@link ScenePrecomp} reduced to JSON-safe values. */
export interface SerializedScenePrecomp {
    format: number;
    frameCount: number;
    audioRequests: unknown[];
    assetRecords: [string, unknown][];
    lifespans: [string, NodeLifespan][];
}

/**
 * JSON has no `Infinity`, and `AssetTracker.requestAudio` legitimately records
 * `trimEnd: Infinity` for an untrimmed clip. `JSON.stringify` would silently turn
 * that into `null` and typecheck as `number`, so encode it explicitly instead of
 * relying on whoever stringifies to preserve it.
 */
const INFINITY = "Infinity";

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reduce a scene's pass to JSON-safe values, or return `null` if it holds
 * something that cannot survive the round trip.
 *
 * Returning `null` rather than a lossy entry is the whole safety story here: a
 * cache that silently drops an asset reference or an audio automation curve would
 * produce a subtly wrong timeline on the next run, which is far worse than simply
 * measuring the scene again. Callers treat `null` as "this scene is not
 * cacheable" and fall back to a real pass.
 *
 * Two things trigger it:
 *
 * - **A loader record.** `LoaderRecord.load` is a live closure owned by the
 *   requesting package, and a function cannot be revived from JSON. (No built-in
 *   path produces one today — the sole caller is gated behind a Canvas3D resource
 *   loader that nothing registers — so this is a guard against a future
 *   regression, not a common case.)
 * - **A curve-valued audio filter param.** `Curve` is a class whose segments carry
 *   `EasingFunction`s; reviving one would need an easing registry keyed by name.
 *   Detected via `filtersKey`, which already has to enumerate every param of every
 *   filter type for playback identity — so this check cannot drift out of sync as
 *   filter types are added.
 */
export function serializeScenePrecomp(precomp: ScenePrecomp): SerializedScenePrecomp | null {
    const assetRecords: [string, unknown][] = [];
    for (const [key, record] of precomp.assetRecords) {
        if (record.type === "loader") return null;
        assetRecords.push([key, encodeRecord(record)]);
    }

    for (const req of precomp.audioRequests) {
        if (req.filters && filtersKey(req.filters).includes("c[")) return null;
    }

    return {
        format: PRECOMP_CACHE_FORMAT,
        frameCount: precomp.frameCount,
        audioRequests: precomp.audioRequests.map(req => ({ ...req })),
        assetRecords,
        lifespans: [...precomp.lifespans.entries()].map(([k, v]) => [k, { ...v }]),
    };
}

/**
 * Rebuild a scene pass from JSON, or return `null` if the input is not a
 * well-formed entry of the current format.
 *
 * Every field is checked rather than trusted. This data comes off disk, where it
 * can be truncated by a crash mid-write, hand-edited, or left over from an older
 * release — and the failure mode of accepting a malformed entry is a wrong
 * timeline that looks perfectly normal. Rejecting costs one scene's measurement.
 */
export function deserializeScenePrecomp(raw: unknown): ScenePrecomp | null {
    if (!isRecord(raw)) return null;
    if (raw.format !== PRECOMP_CACHE_FORMAT) return null;
    if (!isFiniteNumber(raw.frameCount) || raw.frameCount < 0) return null;
    if (!Array.isArray(raw.audioRequests) || !Array.isArray(raw.assetRecords) || !Array.isArray(raw.lifespans)) {
        return null;
    }

    const audioRequests: AudioRequest[] = [];
    for (const entry of raw.audioRequests) {
        const req = decodeAudioRequest(entry);
        if (!req) return null;
        audioRequests.push(req);
    }

    const assetRecords = new Map<string, AssetRecord>();
    for (const pair of raw.assetRecords) {
        if (!Array.isArray(pair) || pair.length !== 2 || !isString(pair[0])) return null;
        const record = decodeRecord(pair[1]);
        if (!record) return null;
        assetRecords.set(pair[0], record);
    }

    const lifespans = new Map<string, NodeLifespan>();
    for (const pair of raw.lifespans) {
        if (!Array.isArray(pair) || pair.length !== 2 || !isString(pair[0])) return null;
        const span = pair[1];
        if (!isRecord(span) || !isFiniteNumber(span.startFrame) || !isFiniteNumber(span.endFrame)) return null;
        lifespans.set(pair[0], { startFrame: span.startFrame, endFrame: span.endFrame });
    }

    return {
        measured: true,
        frameCount: raw.frameCount,
        startFrame: 0, // assigned by assembleTimeline
        audioRequests,
        assetRecords,
        lifespans,
    };
}

function encodeRecord(record: AssetRecord): Record<string, unknown> {
    const out: Record<string, unknown> = { ...record };
    if ("trimEnd" in record && !Number.isFinite(record.trimEnd)) out.trimEnd = INFINITY;
    return out;
}

function decodeRecord(raw: unknown): AssetRecord | null {
    if (!isRecord(raw)) return null;
    const { type, src, startFrame, endFrame } = raw;
    if (!isString(src) || !isFiniteNumber(startFrame) || !isFiniteNumber(endFrame)) return null;

    const out = { ...raw } as Record<string, unknown>;
    if (out.trimEnd === INFINITY) out.trimEnd = Infinity;

    switch (type) {
        case "image":
        case "video":
            if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) return null;
            if (type === "video" && !(isFiniteNumber(out.trimStart) && isNumberOrInfinity(out.trimEnd))) return null;
            return out as unknown as AssetRecord;
        case "font":
            if (!isString(raw.fontFamily) || !isFiniteNumber(raw.fontWeight)) return null;
            return out as unknown as AssetRecord;
        case "audio":
            if (!isFiniteNumber(out.trimStart) || !isNumberOrInfinity(out.trimEnd)) return null;
            return out as unknown as AssetRecord;
        // 'loader' is never written (see serializeScenePrecomp); anything else is
        // from a format we don't understand.
        default:
            return null;
    }
}

const isNumberOrInfinity = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

function decodeAudioRequest(raw: unknown): AudioRequest | null {
    if (!isRecord(raw)) return null;
    const { id, src, startAt, endAt, trimStart, volume, loop } = raw;
    if (!isString(id) || !isString(src)) return null;
    if (!isFiniteNumber(startAt) || !isFiniteNumber(endAt)) return null;
    if (!isFiniteNumber(trimStart) || !isFiniteNumber(volume) || typeof loop !== "boolean") return null;
    if (raw.ownerPath !== undefined && !isString(raw.ownerPath)) return null;
    if (raw.open !== undefined && typeof raw.open !== "boolean") return null;
    if (raw.mediaDuration !== undefined && !isFiniteNumber(raw.mediaDuration)) return null;
    // Filters are plain data only — a curve-valued one is refused at write time,
    // so anything non-plain here means the entry was not written by us.
    if (raw.filters !== undefined && !Array.isArray(raw.filters)) return null;
    return { ...raw } as unknown as AudioRequest;
}
