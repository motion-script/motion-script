import { EngineError } from './errors.js';

/** Which frame a still addresses, in the form the page bridge accepts. */
export type FrameSpec =
    | { kind: 'frame'; frame: number }
    | { kind: 'first' }
    | { kind: 'last' };

/**
 * How a caller names the frame to capture.
 *
 * - `'first'` / `'last'` — that end of the timeline.
 * - a `number` — a **frame index**, always. Whole numbers only; a fractional
 *   number is rejected rather than silently reinterpreted as seconds, because
 *   a library caller computing `duration * 0.5` deserves an error rather than
 *   a different unit.
 * - `{ frame }` / `{ seconds }` — the same two units, said explicitly.
 * - a `string` — free text from a CLI flag, an HTTP query param or a job
 *   record, parsed by {@link parseFrameSelector}: `'42'` is a frame, `'2.5'`
 *   and `'2.5s'` are times, `'first'`/`'last'` are the ends.
 */
export type FrameSelector =
    | number
    | 'first'
    | 'last'
    | string
    | { frame: number }
    | { seconds: number };

/**
 * A validated selector, before `fps` is known. Times stay in seconds here so a
 * caller can reject a malformed selector *before* paying for a browser
 * start-up, and convert once the project's frame rate has been read.
 */
export type ParsedFrame = FrameSpec | { kind: 'time'; seconds: number };

function invalid(raw: unknown): EngineError {
    return new EngineError(
        'INVALID_OPTION',
        `Invalid frame selector: ${JSON.stringify(raw)} ` +
        `(expected a frame number, a time like "2.5s", "first" or "last").`,
    );
}

/** Validate a {@link FrameSelector} into a {@link ParsedFrame}. Throws `INVALID_OPTION`. */
export function parseFrameSelector(selector: FrameSelector): ParsedFrame {
    if (typeof selector === 'number') {
        if (!Number.isInteger(selector) || selector < 0) {
            throw new EngineError(
                'INVALID_OPTION',
                `Invalid frame index: ${selector}. A number selector is a whole frame index — ` +
                `pass { seconds: ${selector} } (or "${selector}s") for a time.`,
            );
        }
        return { kind: 'frame', frame: selector };
    }

    if (typeof selector === 'object' && selector !== null) {
        if ('frame' in selector) {
            const { frame } = selector;
            if (!Number.isInteger(frame) || frame < 0) throw invalid(selector);
            return { kind: 'frame', frame };
        }
        if ('seconds' in selector) {
            const { seconds } = selector;
            if (!Number.isFinite(seconds) || seconds < 0) throw invalid(selector);
            return { kind: 'time', seconds };
        }
        throw invalid(selector);
    }

    if (typeof selector !== 'string') throw invalid(selector);

    const value = selector.trim().toLowerCase();
    if (value === '') throw invalid(selector);
    if (value === 'first') return { kind: 'first' };
    if (value === 'last') return { kind: 'last' };

    // An explicit `s` suffix is always a time ("2.5s", "3s").
    if (value.endsWith('s')) {
        const seconds = Number(value.slice(0, -1));
        if (!Number.isFinite(seconds) || seconds < 0) throw invalid(selector);
        return { kind: 'time', seconds };
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) throw invalid(selector);
    // In text, the integer-vs-decimal split is what disambiguates the unit:
    // frame indices are whole numbers, times are written with a decimal or `s`.
    // (A typed `number` selector has no such ambiguity and is always a frame.)
    return Number.isInteger(num) ? { kind: 'frame', frame: num } : { kind: 'time', seconds: num };
}

/** Resolve a {@link ParsedFrame} to a concrete {@link FrameSpec}, converting any time via `fps`. */
export function toFrameSpec(parsed: ParsedFrame, fps: number): FrameSpec {
    if (parsed.kind === 'time') return { kind: 'frame', frame: Math.round(parsed.seconds * fps) };
    return parsed;
}
