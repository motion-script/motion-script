/**
 * Mixin for effects that can run on the **backdrop** — the content already painted
 * beneath the node — instead of the node's own content. When `backdrop` is `true`,
 * the effect's filter is applied to whatever lies underneath the node and clipped to
 * the node's silhouette, so the node's own edges stay sharp (Figma-style). Defaults
 * to `false` (the effect applies to the node's own content, the foreground).
 *
 * Only filter-expressible effects mix this in (blur, grayscale, …). `magnify` and the
 * backdrop variant of `sksl` address the backdrop through their own dedicated paths.
 */
export interface BackdropCapable {
    backdrop?: boolean;
}

export interface EffectData<T> {
    /**
     * Linearly interpolates between two effect states.
     * @param from The starting state of the effect.
     * @param to The target state of the effect.
     * @param t The interpolation factor (usually a normalized value between 0 and 1).
     * @returns A new effect state representing the blended value.
     */
    lerp: (from: T, to: T, t: number) => T;

    /**
     * Compares two effect states for deep equality.
     * @param a The first effect state.
     * @param b The second effect state.
     * @returns True if the effects are structurally identical, otherwise false.
     */
    equals: (a: T, b: T) => boolean;
}