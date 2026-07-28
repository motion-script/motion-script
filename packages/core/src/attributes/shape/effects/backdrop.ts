import type { SceneEffect } from "./union";
import { effectSurface } from "./registry";

/**
 * Backdrop/foreground classification for effects.
 *
 * Every effect carries a uniform {@link EffectMode} via {@link ModedEffect}, so
 * classification is a single field read — no branching on `effect.type`. An
 * effect with `mode === "backdrop"` runs on the content painted *beneath* the
 * node (clipped to its silhouette); anything else is a foreground effect over
 * the node's own content.
 */

/** Does this effect target the backdrop beneath the node rather than its own content? */
export const isBackdropEffect = (effect: SceneEffect): boolean => effect.mode === "backdrop";

/**
 * Shared result for the overwhelmingly common "this node has no effects" case.
 *
 * Both classifiers below run once per node per frame during render, and `.filter`
 * allocates a fresh array even when there is nothing to filter. On a scene with
 * thousands of plain shapes that is thousands of throwaway arrays per frame, for
 * an answer that is always the same empty list.
 */
const NONE: SceneEffect[] = [];

/** The backdrop-targeting effects in `effects`, for the renderer's backdrop pass. */
export const backdropEffects = (effects: SceneEffect[]): SceneEffect[] =>
    effects.length === 0 ? NONE : effects.filter(isBackdropEffect);

/**
 * Foreground effects that warp/band the node's *own* content and therefore need
 * a snapshot-and-redraw scope rather than a composable image filter.
 *
 * Driven by each effect's declared {@link EffectSurface}, so adding a shader
 * effect needs no edit here. Author chain order is preserved: index 0 is the
 * outermost scope, and the renderer nests the rest inside it.
 */
export function foregroundShaderEffects(effects: SceneEffect[]): SceneEffect[] {
    if (effects.length === 0) return NONE;
    return effects.filter((e) => e.mode !== "backdrop" && effectSurface(e) === "shader");
}
