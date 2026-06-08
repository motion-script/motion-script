import type { CanvasKit, Shader } from "@motion-script/canvaskit";

/**
 * Caches built gradient `Shader`s keyed on a cheap string derived from the
 * resolved fill plus the pixel bounds it was resolved against.
 *
 * Without this, every gradient fill rebuilt its shader (and re-`.map()`'d its
 * colors into Color4f arrays) on every frame for every shape, and the old
 * Shader — a wasm-heap object — was never `.delete()`'d, so it leaked until the
 * JS finalization registry caught up. Reusing a shader while its inputs are
 * unchanged removes both the rebuild cost and the per-frame leak.
 *
 * The cache is bounded; the oldest entry's shader is deleted on eviction.
 */
export class GradientShaderCache {
    private map = new Map<string, Shader>();

    constructor(private readonly limit = 256) {}

    /**
     * Return the cached shader for `key`, or build + store it via `build`.
     * Re-inserts on hit so the Map iteration order acts as a simple LRU.
     */
    get(key: string, build: () => Shader): Shader {
        const existing = this.map.get(key);
        if (existing) {
            // Refresh recency.
            this.map.delete(key);
            this.map.set(key, existing);
            return existing;
        }
        const shader = build();
        this.map.set(key, shader);
        if (this.map.size > this.limit) {
            const oldest = this.map.keys().next().value as string | undefined;
            if (oldest !== undefined) {
                this.map.get(oldest)?.delete();
                this.map.delete(oldest);
            }
        }
        return shader;
    }

    dispose(): void {
        for (const shader of this.map.values()) shader.delete();
        this.map.clear();
    }
}

/** Build a CanvasKit Color4f array from normalized RGBA tuples. */
export function toCkColors(
    ck: CanvasKit,
    colors: readonly (readonly [number, number, number, number])[],
): Float32Array[] {
    return colors.map((c) => ck.Color4f(c[0], c[1], c[2], c[3]));
}

/** Append a list of numbers to a key buffer, comma-separated. */
export function pushNums(parts: string[], nums: readonly number[]): void {
    for (let i = 0; i < nums.length; i++) parts.push(nums[i].toFixed(4));
}
