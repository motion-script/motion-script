import { EngineError } from './errors.js';
import type { VideoCodec } from './types.js';

const VIDEO_CODECS: readonly VideoCodec[] = ['avc', 'hevc', 'av1', 'vp9'];

function invalid(message: string): EngineError {
    return new EngineError('INVALID_OPTION', message);
}

/**
 * Validate a codec name.
 *
 * Accepting free text here is the point: a service takes this from a request
 * body, and rejecting it at the edge with `INVALID_OPTION` beats letting the
 * page throw halfway through a render.
 */
export function parseCodec(raw: unknown): VideoCodec | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = String(raw).trim().toLowerCase();
    if (!(VIDEO_CODECS as readonly string[]).includes(value)) {
        throw invalid(`Invalid codec: ${String(raw)}. Expected one of: ${VIDEO_CODECS.join(', ')}.`);
    }
    return value as VideoCodec;
}

/**
 * Parse a bitrate in bits per second, accepting the `k`/`M` suffixes anyone
 * would actually reach for — `40M` is how this number is written everywhere
 * else, and `40000000` is easy to mistype by an order of magnitude.
 */
export function parseBitrate(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) throw invalid(`Invalid bitrate: ${raw}.`);
        return Math.round(raw);
    }
    const match = /^\s*([0-9]*\.?[0-9]+)\s*([kKmM])?(?:bps|bit\/s)?\s*$/.exec(String(raw));
    if (!match) throw invalid(`Invalid bitrate: ${String(raw)}. Expected e.g. 12000000, 12000k or 12M.`);
    const scale = match[2] === undefined ? 1 : (match[2].toLowerCase() === 'k' ? 1e3 : 1e6);
    const bits = Math.round(Number(match[1]) * scale);
    if (!Number.isFinite(bits) || bits <= 0) throw invalid(`Invalid bitrate: ${String(raw)}.`);
    return bits;
}

/** What a still is encoded as, plus the two labels a caller has to produce anyway. */
export interface ResolvedImageFormat {
    format: 'png' | 'jpeg';
    /** File extension without the dot, preserving a caller's `jpg` spelling. */
    extension: 'png' | 'jpg' | 'jpeg';
    mimeType: 'image/png' | 'image/jpeg';
}

export function parseImageFormat(raw: unknown): ResolvedImageFormat {
    if (raw === undefined || raw === null || raw === '') {
        return { format: 'png', extension: 'png', mimeType: 'image/png' };
    }
    const value = String(raw).trim().toLowerCase().replace(/^\./, '');
    switch (value) {
        case 'png':
            return { format: 'png', extension: 'png', mimeType: 'image/png' };
        case 'jpg':
            return { format: 'jpeg', extension: 'jpg', mimeType: 'image/jpeg' };
        case 'jpeg':
            return { format: 'jpeg', extension: 'jpeg', mimeType: 'image/jpeg' };
        default:
            throw invalid(`Unsupported image format: ${String(raw)} (supported: png, jpg, jpeg).`);
    }
}

/** A resolution multiplier: any finite number above zero. */
export function parseScale(raw: unknown, label = 'scale'): number {
    if (raw === undefined || raw === null) return 1;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw invalid(`Invalid ${label}: ${String(raw)}. Expected a number greater than 0.`);
    }
    return value;
}

/**
 * Supersampling factor. Bounded at 4 because the cost is quadratic: at 5x a
 * 1080p frame is rendered at 5400p, which is a way to turn a render into a
 * timeout rather than a way to improve it.
 */
export function parseSupersample(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw invalid(`Invalid supersample: ${String(raw)}. Expected a whole number from 1 to 4.`);
    }
    return value;
}

/** Scene names, trimmed and de-blanked. An empty selection means "every scene". */
export function parseSceneNames(raw: unknown): string[] | undefined {
    if (raw === undefined || raw === null) return undefined;
    const values = Array.isArray(raw) ? raw : [raw];
    const names = values
        .flatMap(value => String(value).split(','))
        .map(name => name.trim())
        .filter(Boolean);
    return names.length > 0 ? names : undefined;
}

export function parseConcurrency(raw: unknown): number {
    if (raw === undefined || raw === null) return 1;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw invalid(`Invalid concurrency: ${String(raw)}. Expected a whole number of 1 or more.`);
    }
    return value;
}

/** A millisecond budget. `0` means "no limit", which is why it is not simply falsy-checked. */
export function parseTimeout(raw: unknown, fallback: number): number {
    if (raw === undefined || raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw invalid(`Invalid timeout: ${String(raw)}. Expected a non-negative number of milliseconds.`);
    }
    return value;
}
