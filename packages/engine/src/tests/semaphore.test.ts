import { describe, expect, it } from 'vitest';
import { Semaphore } from '../semaphore.js';

describe('Semaphore', () => {
    it('lets exactly `permits` holders through at once', async () => {
        const sem = new Semaphore(2);
        await sem.acquire();
        await sem.acquire();
        expect(sem.free).toBe(0);

        let third = false;
        const pending = sem.acquire().then(() => { third = true; });
        await Promise.resolve();
        expect(third).toBe(false);
        expect(sem.pending).toBe(1);

        sem.release();
        await pending;
        expect(third).toBe(true);
    });

    it('serves the queue first-in-first-out', async () => {
        const sem = new Semaphore(1);
        await sem.acquire();

        const order: string[] = [];
        const a = sem.acquire().then(() => { order.push('a'); });
        const b = sem.acquire().then(() => { order.push('b'); });
        const c = sem.acquire().then(() => { order.push('c'); });

        sem.release();
        await a;
        sem.release();
        await b;
        sem.release();
        await c;

        expect(order).toEqual(['a', 'b', 'c']);
    });

    it('hands a released permit straight to a waiter, so a late caller cannot barge in', async () => {
        const sem = new Semaphore(1);
        await sem.acquire();
        const queued = sem.acquire();

        sem.release();
        // The permit went to `queued`, not back to the counter.
        expect(sem.free).toBe(0);
        await expect(queued).resolves.toBeUndefined();
    });

    it('drops an aborted waiter out of the queue', async () => {
        const sem = new Semaphore(1);
        await sem.acquire();

        const controller = new AbortController();
        const queued = sem.acquire(controller.signal);
        const after = sem.acquire();
        expect(sem.pending).toBe(2);

        controller.abort();
        await expect(queued).rejects.toMatchObject({ code: 'ABORTED' });
        expect(sem.pending).toBe(1);

        // The abort must not have consumed the permit meant for the next in line.
        sem.release();
        await expect(after).resolves.toBeUndefined();
    });

    it('rejects immediately for an already-aborted signal', async () => {
        const sem = new Semaphore(1);
        const controller = new AbortController();
        controller.abort();
        await expect(sem.acquire(controller.signal)).rejects.toMatchObject({ code: 'ABORTED' });
        // ...without taking the permit it never got to use.
        expect(sem.free).toBe(1);
    });

    it('drain rejects everything still queued', async () => {
        const sem = new Semaphore(1);
        await sem.acquire();
        const first = sem.acquire();
        const second = sem.acquire();

        sem.drain(new Error('closed'));

        await expect(first).rejects.toThrow('closed');
        await expect(second).rejects.toThrow('closed');
        expect(sem.pending).toBe(0);
    });
});
