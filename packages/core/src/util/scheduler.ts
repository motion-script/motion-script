/**
 * Event-loop yielding, for work that must stay interruptible.
 *
 * A long synchronous loop on the main thread cannot be cancelled: nothing else
 * can run to *ask* it to stop. `StateEvaluator`'s backward-seek replay is
 * exactly that shape, so it yields periodically through {@link yieldToScheduler}
 * — which is what lets a newer seek supersede one already in flight.
 *
 * Core is backend-agnostic (no DOM), so every mechanism here is feature-detected
 * and the module works unchanged in a browser, in Node, and under vitest.
 */

/** Monotonic-ish clock in milliseconds. `performance` is absent in some hosts. */
export function now(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}

type SchedulerWithYield = { yield?: () => Promise<void> };

/** `scheduler.yield()` when the host has it (Chrome 129+), else undefined. */
function nativeYield(): (() => Promise<void>) | undefined {
    const s = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
    return typeof s?.yield === "function" ? s.yield.bind(s) : undefined;
}

/**
 * A single shared `MessageChannel`, because a yield-per-channel would allocate
 * (and leak until GC) thousands of ports over one scrub. Callbacks queue in FIFO
 * order and each posted message drains exactly one, so resolution order matches
 * call order.
 */
let channel: MessageChannel | null = null;
const queue: (() => void)[] = [];

function messageChannelYield(): Promise<void> | null {
    if (typeof MessageChannel !== "function") return null;
    if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => queue.shift()?.();
        // Node2D keeps the event loop alive for an open port, which would hang
        // vitest on exit. Browsers have no unref and don't need one.
        (channel.port1 as unknown as { unref?: () => void }).unref?.();
        (channel.port2 as unknown as { unref?: () => void }).unref?.();
    }
    return new Promise<void>(resolve => {
        queue.push(resolve);
        channel!.port2.postMessage(null);
    });
}

/**
 * Yield to the event loop, letting pending input, timers and rendering run
 * before the caller resumes.
 *
 * Deliberately a **macrotask**, not a microtask: `await Promise.resolve()`
 * drains within the same task and would starve exactly the work we're yielding
 * for. `requestAnimationFrame` is also wrong here — it caps throughput to the
 * display rate and stops entirely in a background tab, which would stall
 * headless export and tests.
 *
 * Preference order:
 * 1. `scheduler.yield()` — resumes at continuation priority, so a sliced task
 *    isn't starved behind unrelated work queued while it was parked.
 * 2. `MessageChannel` — a true macrotask with no clamping, in browsers and
 *    Node2D ≥ 15.
 * 3. `setTimeout(0)` — last resort; clamps to ~4 ms once nested, capping the
 *    slice rate, but always available.
 */
export function yieldToScheduler(): Promise<void> {
    const native = nativeYield();
    if (native) return native();
    return messageChannelYield() ?? new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** Drop the shared channel. Tests only — the next yield lazily rebuilds it. */
export function __resetSchedulerForTests(): void {
    channel?.port1.close();
    channel?.port2.close();
    channel = null;
    queue.length = 0;
}
