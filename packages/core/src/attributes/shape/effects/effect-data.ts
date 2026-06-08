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