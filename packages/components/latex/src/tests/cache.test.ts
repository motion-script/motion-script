import { describe, expect, it } from "vitest";

import { createBoundedCache } from "../cache";

/**
 * The memo under `buildLatexPath`.
 *
 * Worth its own test because it is the one part of that path a test can reach:
 * `geometry.ts` builds a MathJax document against `window` at module scope, so
 * anything importing it needs a DOM, while what actually decides whether the
 * memo helps or hurts — which entry is thrown away when it is full — is plain
 * bookkeeping.
 */
describe("createBoundedCache", () => {
    it("answers with what it was given, and nothing for a key it has not seen", () => {
        const cache = createBoundedCache<string>(4);
        cache.set("a", "formula-a");

        expect(cache.get("a")).toBe("formula-a");
        expect(cache.get("b")).toBeUndefined();
    });

    it("overwrites in place rather than growing", () => {
        const cache = createBoundedCache<string>(4);
        cache.set("a", "first");
        cache.set("a", "second");

        expect(cache.size).toBe(1);
        expect(cache.get("a")).toBe("second");
    });

    it("holds the limit and no more", () => {
        const cache = createBoundedCache<number>(3);
        for (let i = 0; i < 10; i++) cache.set(`k${i}`, i);

        expect(cache.size).toBe(3);
        expect(cache.get("k9")).toBe(9);
        expect(cache.get("k0")).toBeUndefined();
    });

    it("evicts the coldest entry, not the oldest", () => {
        const cache = createBoundedCache<string>(2);
        cache.set("kept", "a");
        cache.set("cold", "b");

        // Reading "kept" makes "cold" the least recently used, even though
        // "kept" was written first. This is the whole reason it is an LRU: a
        // formula that is asked for on every rebuild must outlive the stream of
        // one-off keys a `fontSize` animation pushes through.
        expect(cache.get("kept")).toBe("a");
        cache.set("new", "c");

        expect(cache.get("kept")).toBe("a");
        expect(cache.get("cold")).toBeUndefined();
        expect(cache.get("new")).toBe("c");
    });

    it("survives a stream of misses without losing what is being reused", () => {
        const cache = createBoundedCache<string>(8);
        cache.set("hot", "formula");

        // Stands in for a size tween: a distinct key per frame, with the one
        // formula that matters read once per frame alongside it.
        for (let frame = 0; frame < 200; frame++) {
            expect(cache.get("hot")).toBe("formula");
            cache.set(`size-${frame}`, "junk");
        }

        expect(cache.get("hot")).toBe("formula");
        expect(cache.size).toBe(8);
    });
});
