import { lerpNumber } from "@/tween/lerp";
import type { AssetTracker } from "@/assets/tracker";
import { lerpFilterArray, prepareFilter } from "../filters/registry";
import { resolveChainAdjustments } from "../filters/chain";
import type { ImageAdjustment, VideoAdjustment } from "../filters/chain";
import type { MediaAdjustment, VideoOnlyAdjustment } from "../filters/union";

/**
 * A **preset**: the grade a media fill carries — an ordered chain of
 * adjustments plus one dry/wet mix.
 *
 * This replaces the bare `filters` array a media fill used to take, and the
 * reason it is a wrapper rather than a second sibling prop is `intensity`. A
 * grade is authored as a *look*, and the question asked of a look constantly is
 * "the same, but less" — which is one number about the whole chain, not a number
 * to be smeared back across every adjustment in it. Scaling each adjustment
 * toward its own neutral is the approximation you are forced into when the
 * renderer can't mix; here it can, so it does, and "50% of this LUT" means
 * exactly what it says.
 *
 * The old `filters` prop is still accepted and folded in — see
 * {@link resolveMediaPreset}.
 */
export interface MediaPresetProp {
    /** The chain: one adjustment, a plain array, or an {@link AdjustmentChain}. */
    adjustments?: ImageAdjustment;
    /**
     * How much of the grade to apply, 0–1. Defaults to 1.
     *
     * A real mix against the ungraded pixels, not a scaling of the chain's own
     * values.
     */
    intensity?: number;
}

/** {@link MediaPresetProp} for a video fill, which also admits the temporal adjustments. */
export interface VideoPresetProp {
    adjustments?: VideoAdjustment;
    intensity?: number;
}

/** A preset with its chain flattened and its mix defaulted. */
export interface MediaPresetResolved<A = MediaAdjustment> {
    adjustments: A[];
    intensity: number;
}

/** The preset a fill has when it says nothing — no chain, fully wet. */
const NEUTRAL: MediaPresetResolved<never> = { adjustments: [], intensity: 1 };

/**
 * Normalise a fill's grade, folding in the deprecated `filters` prop.
 *
 * `undefined` — not an empty preset — when there is no grade at all, because a
 * media fill with no adjustments takes a cheaper path through the renderer and
 * an always-present key would take every ungraded image in a project off it.
 * The same rule `crop` follows one level up.
 *
 * `filters` loses to `adjustments` when a fill somehow carries both: the new
 * spelling is the one the author reached for most recently.
 */
export function resolveMediaPreset(
    preset: MediaPresetProp | VideoPresetProp | undefined,
    legacyFilters?: ImageAdjustment | VideoAdjustment,
): MediaPresetResolved<MediaAdjustment | VideoOnlyAdjustment> | undefined {
    const chain = preset?.adjustments ?? legacyFilters;
    const adjustments = resolveChainAdjustments(chain);
    if (adjustments.length === 0) return undefined;
    return {
        adjustments,
        // Clamped rather than trusted: an intensity outside 0–1 would make the
        // renderer's mix extrapolate past the graded image, which is a look
        // nobody asked for and no control can produce.
        intensity: Math.min(1, Math.max(0, preset?.intensity ?? 1)),
    };
}

/**
 * Interpolate two presets.
 *
 * The chain lerps pairwise (see {@link lerpFilterArray}) and the mix lerps as a
 * number, so a grade can be animated either way — by moving the adjustments'
 * own values, or by moving `intensity`.
 *
 * **An absent preset is read as the other side's chain at `intensity: 0`**, not
 * as an empty chain. That is the whole reason the mix is worth having, and it
 * fixes something the bare `filters` array could not express: `lerpFilterArray`
 * keeps an index present on only one side *as-is*, so tweening a fill from
 * grayscaled to ungraded used to hold the grayscale at full strength for the
 * entire tween and then cut. Holding the chain and fading the mix is what
 * "remove this grade over half a second" has always meant.
 */
export function lerpMediaPreset<A extends MediaAdjustment | VideoOnlyAdjustment>(
    a: MediaPresetResolved<A> | undefined,
    b: MediaPresetResolved<A> | undefined,
    t: number,
): MediaPresetResolved<A> | undefined {
    if (!a && !b) return undefined;
    const from = a ?? { adjustments: b!.adjustments, intensity: 0 };
    const to = b ?? { adjustments: a!.adjustments, intensity: 0 };
    return {
        adjustments: lerpFilterArray(from.adjustments, to.adjustments, t) as A[],
        intensity: lerpNumber(from.intensity, to.intensity, t),
    };
}

/**
 * Let a preset's chain declare the assets it needs at this frame.
 *
 * An adjustment can reference one — `texture` and `displace` sample an image,
 * `ascii` bakes a glyph atlas — and the backend's lookup is synchronous, so an
 * unrequested asset reads as "no texture" and the adjustment silently no-ops.
 */
export function prepareMediaPreset(
    preset: MediaPresetResolved<MediaAdjustment | VideoOnlyAdjustment> | undefined,
    tracker: AssetTracker,
    width: number,
    height: number,
): void {
    for (const adjustment of preset?.adjustments ?? []) {
        prepareFilter(adjustment, tracker, width, height);
    }
}

/** The neutral preset, for a reader that would rather not branch on `undefined`. */
export function neutralPreset<A>(): MediaPresetResolved<A> {
    return NEUTRAL as MediaPresetResolved<A>;
}
