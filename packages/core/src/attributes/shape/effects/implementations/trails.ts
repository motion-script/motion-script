import { lerpNumber } from "@/tween/lerp";
import type { BlendMode } from "../../fill/blend";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Motion trails — the node composited with a trail of its own **past frames**,
 * each delayed by `delay` seconds and faded by a `decay` factor.
 *
 * The node-level counterpart of the video `echo` filter, and it shares that
 * filter's vocabulary deliberately: same fields, same meaning, different scope.
 * Where `echo` reaches back into a decoded video's own frames, this reaches back
 * into what the *node* drew — so it trails text, shapes, a whole subtree, or a
 * 3D view.
 *
 * Unlike every other effect here, this one is **history-dependent**: frame *N*
 * is built from frames *N−1, N−2, …*, so it cannot be derived from the playhead
 * alone. Two consequences worth knowing before reaching for it:
 *
 * - **Linear playback and exports are correct.** The exporter renders forward
 *   frame by frame, so the history is exactly what the trail needs.
 * - **Scrubbing backwards rebuilds it.** Jumping the playhead discards the
 *   history and the trail fills back in over the next `echoes × delay` seconds,
 *   the same way `echo` refills after a cold seek.
 *
 * For a trail that *is* a pure function of the playhead, tween a stack of
 * offset copies instead — more work to author, but frame-exact under scrubbing.
 */
export interface TrailsEffect extends ModedEffect {
    type: "trails";
    /** Number of past-frame taps drawn behind the current frame. 0 = off. */
    echoes: number;
    /** Delay between successive taps, in seconds. */
    delay: number;
    /** Per-tap alpha multiplier; tap `n` is drawn at `decay ** n`. */
    decay: number;
    /** How the taps composite onto each other. */
    blend: BlendMode;
}

export const trailsEffect: EffectData<TrailsEffect> = {
    lerp: (from, to, t) => ({
        type: "trails",
        // A tap count is discrete — the shader draws whole taps, so a fractional
        // one would round anyway. Round rather than snap so a tween from 0 to 8
        // grows the trail instead of popping it in at the midpoint.
        echoes: Math.round(lerpNumber(from.echoes, to.echoes, t)),
        delay: lerpNumber(from.delay, to.delay, t),
        decay: lerpNumber(from.decay, to.decay, t),
        blend: t < 0.5 ? from.blend : to.blend,
        mode: t < 0.5 ? from.mode : to.mode,
    }),
    equals: (a, b) =>
        a.echoes === b.echoes &&
        a.delay === b.delay &&
        a.decay === b.decay &&
        a.blend === b.blend &&
        a.mode === b.mode,
    // Needs the node's own content snapshotted so past snapshots can be kept and
    // recomposited — the foreground-capture path, not a composable filter.
    surface: "shader",
};
