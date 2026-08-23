/**
 * Every failure the engine surfaces carries one of these codes, so a service
 * can map it onto a response without pattern-matching on message text.
 *
 * - `PROJECT_NOT_FOUND`  — the path is not a Motion Script project (→ 400/404)
 * - `INVALID_OPTION`     — a caller-supplied option is out of range (→ 400)
 * - `UNKNOWN_SCENE`      — a requested scene name is not in the project (→ 400)
 * - `START_FAILED`       — Vite or Chromium could not start (→ 500)
 * - `BRIDGE_TIMEOUT`     — the page loaded but never installed the bridge (→ 500)
 * - `BRIDGE_INCOMPATIBLE`— the project's `@motion-script/vite-plugin` is stale (→ 500)
 * - `RENDER_FAILED`      — the render itself threw inside the page (→ 500)
 * - `TIMEOUT`            — the job exceeded its time budget (→ 504)
 * - `ABORTED`            — the caller's `AbortSignal` fired (→ 499)
 * - `CLOSED`             — the engine was closed while the job was pending (→ 503)
 */
export type EngineErrorCode =
    | 'PROJECT_NOT_FOUND'
    | 'INVALID_OPTION'
    | 'UNKNOWN_SCENE'
    | 'START_FAILED'
    | 'BRIDGE_TIMEOUT'
    | 'BRIDGE_INCOMPATIBLE'
    | 'RENDER_FAILED'
    | 'TIMEOUT'
    | 'ABORTED'
    | 'CLOSED';

/** An error raised by the engine, tagged with a stable {@link EngineErrorCode}. */
export class EngineError extends Error {
    override readonly name = 'EngineError';
    readonly code: EngineErrorCode;

    constructor(code: EngineErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.code = code;
    }
}

export function isEngineError(err: unknown): err is EngineError {
    return err instanceof EngineError;
}

/**
 * Strip Playwright's wrapper from an in-page error.
 *
 * A throw inside the page surfaces as `page.evaluate: <real message>` followed
 * by the browser stack. Callers want the actionable first line, not the
 * plumbing, and a service that logs the raw string leaks a browser stack into
 * its own logs for what is usually a bad scene name.
 */
export function cleanPageErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
        .split('\n')[0]
        .replace(/^(page\.evaluate|page\.goto|page\.waitForSelector|locator\.\w+):\s*/, '')
        // The page-side message arrives as "Error: <msg>"; drop the redundant
        // prefix so callers can add their own label.
        .replace(/^Error:\s*/, '')
        .trim();
}

/**
 * Translate an error thrown by a page call into an {@link EngineError}.
 *
 * The bridge validates scene names itself and throws `Unknown scene(s): …`
 * (see the vite-plugin's headless bridge). That is caller error, not engine
 * failure, so it gets its own code — the distinction is exactly what lets a
 * service answer 400 instead of 500.
 */
export function toRenderError(err: unknown): EngineError {
    if (isEngineError(err)) return err;
    const message = cleanPageErrorMessage(err);
    if (/^Unknown scene\(s\):/i.test(message)) {
        return new EngineError('UNKNOWN_SCENE', message, { cause: err });
    }
    return new EngineError('RENDER_FAILED', message || 'The render failed.', { cause: err });
}
