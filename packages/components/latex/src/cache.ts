/**
 * A bounded, least-recently-used memo.
 *
 * Sits under `geometry.ts`, and imports nothing, so it is testable in bare Node:
 * everything else in this package reaches MathJax's browser adaptor at module
 * scope, which means a test that touches it needs a DOM. The one piece of logic
 * here worth being sure about — what gets thrown away when the memo is full —
 * is exactly the piece that does not need one.
 *
 * Least-recently-used rather than oldest-first, and that matters for the shape
 * of work this sees. A `Latex` node re-resolves its formula whenever `fontSize`
 * changes, so animating the size of one formula inserts a fresh key every frame
 * and would, under a first-in-first-out rule, walk the whole memo out of it in a
 * couple of seconds — including the entries for every *other* formula in the
 * scene, none of which had done anything wrong. Touching an entry on read keeps
 * the formulas that are actually being asked for ahead of the ones streaming
 * past.
 */

export interface BoundedCache<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    /** Entries held. For tests and for anyone measuring. */
    readonly size: number;
}

/**
 * @param limit Most entries to hold. One more arriving evicts the least
 *              recently read or written.
 */
export function createBoundedCache<T>(limit: number): BoundedCache<T> {
    // Insertion order is the eviction order, which is what makes a plain `Map`
    // an LRU as long as every read re-inserts.
    const entries = new Map<string, T>();

    return {
        get(key) {
            if (!entries.has(key)) return undefined;
            const value = entries.get(key) as T;
            // Delete-then-set moves the key to the end, so the next eviction
            // takes the genuinely coldest entry rather than the oldest one.
            entries.delete(key);
            entries.set(key, value);
            return value;
        },

        set(key, value) {
            entries.delete(key);
            entries.set(key, value);
            while (entries.size > limit) {
                const coldest = entries.keys().next().value;
                if (coldest === undefined) break;
                entries.delete(coldest);
            }
        },

        get size() {
            return entries.size;
        },
    };
}
