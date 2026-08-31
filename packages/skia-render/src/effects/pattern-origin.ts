import type { EffectMode } from "@motion-script/core";
import type { EffectGeometry } from "./handler";

/**
 * The point a **generated pattern** should be measured from, in device px.
 *
 * ## The problem this solves
 *
 * A shader effect runs with the CTM reset to identity, so its `fragCoord` is a
 * device pixel — the same device pixel whatever the node happens to be doing.
 * An effect that only *reads* neighbours (`u_content.eval(fragCoord + offset)`)
 * is unaffected by that, because both the sample and its neighbour travel with
 * the content. An effect that **generates** something from the coordinate is
 * not: quantise `fragCoord` into a grain cell or a dither cell and the lattice
 * is nailed to the screen, so moving the node slides its own picture through a
 * pattern that stays put. A grain that crawls, a dither whose Bayer lattice
 * swims, a scatter that boils — all one bug, and all of it worst during exactly
 * the gesture you notice it most, which is animating a position.
 *
 * Rebasing the coordinate on the node's own box fixes it: the same point of the
 * picture gets the same pattern cell wherever the node is standing, so the
 * texture is a property of the thing rather than of the screen behind it. That
 * is what film grain, a halftone screen and a print dither all physically are.
 *
 * ## Why `backdrop` is exempt
 *
 * A backdrop effect samples the canvas already painted *beneath* the node, and
 * that content does not move when the node does. Anchoring its pattern to the
 * node would introduce the very drift this exists to remove, mirror-imaged: a
 * still background whose grain crawls because something in front of it moved.
 * So a backdrop effect keeps device space, which for it *is* the content's own
 * space.
 *
 * The node's top-left rather than its centre, so a shader can divide straight
 * into cell indices without a half-box bias — {@link EffectGeometry} reports the
 * centre because the box is what it measures, and the corner is one subtraction
 * away. Effects that want the centre (a radial ramp, a texture's mapping) go on
 * using `centerX`/`centerY` directly.
 */
export function patternOrigin(
    effect: { mode?: EffectMode },
    geom: EffectGeometry,
): [number, number] {
    if (effect.mode === "backdrop") return [0, 0];
    return [geom.centerX - geom.width / 2, geom.centerY - geom.height / 2];
}
