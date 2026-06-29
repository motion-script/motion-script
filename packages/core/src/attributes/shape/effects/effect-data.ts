/**
 * Which layer an effect runs on: the node's own content (`"foreground"`, the
 * default) or the **backdrop** — the content already painted beneath the node.
 * A backdrop effect is applied to whatever lies underneath the node and clipped
 * to the node's silhouette, so the node's own edges stay sharp (Figma-style).
 */
export type EffectMode = "foreground" | "backdrop";

/**
 * Mixin: every effect declares the layer it targets via {@link EffectMode}.
 * Omitted is treated as `"foreground"`. A single uniform field across all effects
 * means the backdrop/foreground classifier never has to branch on `type`.
 */
export interface ModedEffect {
    mode?: EffectMode;
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