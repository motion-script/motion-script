import { describe, expect, it, vi } from 'vitest';
import { withDeadline } from './deadline.js';

describe('withDeadline', () => {
    it('passes a result through when nothing is racing it', async () => {
        await expect(withDeadline(Promise.resolve('done'), undefined, 0)).resolves.toBe('done');
    });

    it('rejects with TIMEOUT once the budget is spent', async () => {
        const never = new Promise<never>(() => undefined);
        await expect(withDeadline(never, undefined, 10)).rejects.toMatchObject({ code: 'TIMEOUT' });
    });

    it('rejects with ABORTED when the caller cancels', async () => {
        const controller = new AbortController();
        const never = new Promise<never>(() => undefined);
        const job = withDeadline(never, controller.signal, 0);
        controller.abort(new Error('client went away'));
        await expect(job).rejects.toMatchObject({ code: 'ABORTED' });
    });

    it('rejects immediately for a signal that is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const never = new Promise<never>(() => undefined);
        await expect(withDeadline(never, controller.signal, 1000)).rejects.toMatchObject({ code: 'ABORTED' });
    });

    it('keeps the work rejection from escaping once the race is over', async () => {
        // The page cannot be interrupted, so the losing work settles later. Its
        // failure must stay handled: an unhandled rejection here would take a
        // server process down long after the request was answered.
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            let fail: (err: Error) => void = () => undefined;
            const work = new Promise<never>((_, reject) => { fail = reject; });
            const job = withDeadline(work, undefined, 5);
            await expect(job).rejects.toMatchObject({ code: 'TIMEOUT' });
            fail(new Error('late render failure'));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });

    it('clears its timer when the work wins, so the process can exit', async () => {
        const clear = vi.spyOn(globalThis, 'clearTimeout');
        await expect(withDeadline(Promise.resolve(1), undefined, 60_000)).resolves.toBe(1);
        expect(clear).toHaveBeenCalled();
        clear.mockRestore();
    });
});
