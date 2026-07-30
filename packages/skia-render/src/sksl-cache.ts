import type { CanvasKit, RuntimeEffect } from "@motion-script/canvaskit";

// Keyed by shader source so identical SkSL across effects/instances compiles once.
const cache = new Map<string, RuntimeEffect>();

/** Compile-and-cache a RuntimeEffect by shader source; returns the cached instance on repeat calls. */
export function getOrCompileSkSL(shader: string, ck: CanvasKit): RuntimeEffect | null {
    const cached = cache.get(shader);
    if (cached) return cached;
    const effect = ck.RuntimeEffect.Make(shader, (err) => {
        console.warn("[SkSL] Compilation error:", err);
    });
    if (effect) cache.set(shader, effect);
    return effect ?? null;
}

/** Delete every cached RuntimeEffect's GPU resources and clear the cache (draw context teardown). */
export function disposeSkSLCache(): void {
    for (const effect of cache.values()) effect.delete();
    cache.clear();
}
