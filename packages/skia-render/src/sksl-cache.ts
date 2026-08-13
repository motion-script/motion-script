import type { CanvasKit, RuntimeEffect } from "@motion-script/canvaskit";

// Keyed by shader source so identical SkSL across effects/instances compiles once.
const cache = new Map<string, RuntimeEffect>();

/**
 * Distinct sources past which the cache is almost certainly being fed generated
 * text rather than a fixed set of programs.
 *
 * The built-in handlers bake a bounded number of variants into their source (a
 * basis × octave count × stop count, say), so they plateau. An author-written
 * shader fill does not: interpolating a changing value into a template literal
 * compiles a program per frame and this cache never evicts, so it is worth saying
 * so once rather than leaking silently until the tab dies.
 */
const SOURCE_CEILING = 64;
let ceilingWarned = false;

/** Compile-and-cache a RuntimeEffect by shader source; returns the cached instance on repeat calls. */
export function getOrCompileSkSL(shader: string, ck: CanvasKit): RuntimeEffect | null {
    const cached = cache.get(shader);
    if (cached) return cached;
    const effect = ck.RuntimeEffect.Make(shader, (err) => {
        console.warn("[SkSL] Compilation error:", err);
    });
    if (effect) cache.set(shader, effect);
    if (cache.size > SOURCE_CEILING && !ceilingWarned) {
        ceilingWarned = true;
        console.warn(
            `[SkSL] ${cache.size} distinct shader sources have been compiled. If a shader's source is built per frame `
            + "(e.g. a value interpolated into a template literal), keep the source constant and move what changes "
            + "into a uniform — uniform values are an in-place write, a new source is a new program.",
        );
    }
    return effect ?? null;
}

/** Delete every cached RuntimeEffect's GPU resources and clear the cache (draw context teardown). */
export function disposeSkSLCache(): void {
    for (const effect of cache.values()) effect.delete();
    cache.clear();
    ceilingWarned = false;
}
