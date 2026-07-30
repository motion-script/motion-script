import { lerpNumber } from "@/tween/lerp";
import type { BlendMode } from "../../fill/blend";
import type { ModedEffect, EffectData } from "../effect-data";

/**
 * Motion trails — the node echoed along its own motion, each tap `delay` seconds
 * further back and faded by a `decay` factor.
 *
 * The node-level counterpart of the video `echo` filter, and it shares that
 * filter's vocabulary deliberately: same fields, same meaning, different scope.
 * Where `echo` reaches back into a decoded video's own frames, this echoes what
 * the *node* drew — so it trails text, shapes, a whole subtree, or a 3D view.
 *
 * **Velocity-derived, not frame-buffered**, exactly like {@link MotionBlurEffect}.
 * Each tap reconstructs where the node was by undoing `delay × n` of its sampled
 * motion, which keeps the effect a pure function of the playhead: motion is
 * sampled on every *advanced* frame rather than every rendered one, so a
 * backward scrub lands on the same trail a forward play would. A frame-history
 * implementation cannot do that — seeking replays the scene generator without
 * drawing the frames it passes through, so there is no history to rebuild from.
 *
 * The trade is that a tap extrapolates along the *current* velocity rather than
 * following the node's actual past path, so a trail spanning a sharp curve
 * straightens out. Motion blur makes the same approximation across one frame;
 * here it spans `echoes × delay`, so keep the trail short relative to how fast
 * the path turns.
 *
 * A node that is not moving has no trail and renders untouched, rather than
 * stacking `echoes` copies of itself into a glow.
 */
export interface TrailsEffect extends ModedEffect {
    type: "trails";
    /** Number of echo taps drawn behind the node. 0 = off. */
    echoes: number;
    /** How far back each successive tap reaches, in seconds. */
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
    // Resamples the content at displaced positions, one per tap.
    surface: "shader",
};
