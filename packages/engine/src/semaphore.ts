import { EngineError } from './errors.js';

type Waiter = {
    resolve(): void;
    reject(err: unknown): void;
    dispose(): void;
};

/**
 * A counting semaphore with a FIFO queue and abortable waits.
 *
 * This is what bounds the engine's concurrency. It is a separate primitive
 * from the session pool because the two answer different questions — "may
 * another job run?" and "which page does it run on?" — and only the first one
 * has interesting edge cases (queue order, cancelling from the queue, closing
 * with jobs still waiting).
 */
export class Semaphore {
    private available: number;
    private readonly waiters: Waiter[] = [];

    constructor(permits: number) {
        this.available = Math.max(1, Math.floor(permits));
    }

    /** Jobs currently queued for a permit. */
    get pending(): number {
        return this.waiters.length;
    }

    /** Permits not currently held. */
    get free(): number {
        return this.available;
    }

    /** Take a permit, waiting in line if none is free. Always pair with {@link release}. */
    acquire(signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) {
            return Promise.reject(new EngineError('ABORTED', 'The job was aborted.', { cause: signal.reason }));
        }
        if (this.available > 0) {
            this.available -= 1;
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
                const index = this.waiters.indexOf(waiter);
                if (index >= 0) this.waiters.splice(index, 1);
                waiter.dispose();
                reject(new EngineError('ABORTED', 'The job was aborted.', { cause: signal?.reason }));
            };
            const waiter: Waiter = {
                resolve,
                reject,
                dispose: () => signal?.removeEventListener('abort', onAbort),
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.waiters.push(waiter);
        });
    }

    /**
     * Give a permit back — to the longest-waiting job if there is one, rather
     * than to the counter. Handing it over directly is what keeps the queue
     * FIFO instead of letting a caller that arrives later barge in.
     */
    release(): void {
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter.dispose();
            waiter.resolve();
            return;
        }
        this.available += 1;
    }

    /** Reject everything still queued, e.g. because the engine is shutting down. */
    drain(err: unknown): void {
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter.dispose();
            waiter.reject(err);
        }
    }
}
