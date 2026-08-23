import { EngineError } from './errors.js';

/**
 * Race `work` against a caller's abort signal and a time budget.
 *
 * `work` is deliberately *not* cancelled when it loses: nothing can interrupt
 * a render already running inside a page, so the caller retires the page
 * instead (see `MotionScriptEngine.run`). Its eventual result is still
 * observed here, so a late failure cannot surface as an unhandled rejection
 * and take a server process down with it.
 *
 * A `timeout` of `0` (or less) means no time limit.
 */
export function withDeadline<T>(
    work: Promise<T>,
    signal: AbortSignal | undefined,
    timeout: number,
): Promise<T> {
    if (!signal && timeout <= 0) return work;

    return new Promise<T>((resolve, reject) => {
        let settled = false;

        const finish = (settleOnce: () => void): void => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            settleOnce();
        };

        const timer = timeout > 0
            ? setTimeout(
                () => finish(() => reject(new EngineError(
                    'TIMEOUT',
                    `The render exceeded its ${timeout} ms budget.`,
                ))),
                timeout,
            )
            : null;

        const onAbort = (): void => finish(() => reject(
            new EngineError('ABORTED', 'The job was aborted.', { cause: signal?.reason }),
        ));

        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });

        work.then(
            value => finish(() => resolve(value)),
            (err: unknown) => finish(() => reject(err)),
        );
    });
}
