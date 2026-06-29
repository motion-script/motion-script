import type { SceneEffect } from "./union";

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

/** The backdrop-targeting effects in `effects`, for the renderer's backdrop pass. */
export const backdropEffects = (effects: SceneEffect[]): SceneEffect[] => effects.filter(isBackdropEffect);

/**
 * Foreground shader effects that warp/band the node's *own* content, in compose
 * order: posterize wraps bulge, so the renderer applies bulge inside it
 * (mirroring how blur-style content effects nest). A backdrop-mode posterize
 * bands the backdrop instead (see {@link backdropEffects}), so it's excluded here.
 */
export function foregroundShaderEffects(effects: SceneEffect[]): SceneEffect[] {
    const posterize = effects.find((e) => e.type === "posterize" && e.mode !== "backdrop");
    const bulge = effects.find((e) => e.type === "bulge");
    const out: SceneEffect[] = [];
    if (posterize) out.push(posterize);
    if (bulge) out.push(bulge);
    return out;
}
