import { MeasureScope } from "./measure-scope";
import { FontStyle } from "@/attributes/text/span";
import { AssetTracker } from "@/assets/tracker";

/**
 * A `MeasureScope` that registers every font it's asked to measure into an
 * `AssetTracker`, then delegates the actual measurement to the real scope.
 *
 * This is what lets font discovery be inferred from `layout()`'s own
 * `measureText()` calls instead of a hand-written `prepareLayout` declaration:
 * `Precomp.precompScene` swaps this in for its dry-run `layout()` pass only —
 * real playback (`StateEvaluator`) keeps using the real scope directly.
 *
 * Precomp's dry-run measurements were never accurate to begin with: the font
 * manager the real scope reads from starts empty and is only populated by
 * `AssetManager`, strictly *after* the whole precomp pass completes, so a
 * `requestFont` declared one line ahead of `layout()` never actually changed
 * what that pass measured against — it only fed the asset timeline. This
 * wrapper feeds the same timeline as a side effect of the measurement that
 * was already happening, at the same (already-approximate) accuracy.
 *
 * A node retains whatever `MeasureScope` it was last laid out with (see
 * `_lastScope` in `node-lifecycle.ts`) so an animated add/remove can measure a
 * detached child's natural "hug" size later, from inside the scene's own
 * generator body — outside precomp's per-frame `registry.start()/end()`
 * bracket. That's always been safe against the real scope (a stateless pure
 * function) but isn't against this one, since `requestFont` requires an open
 * frame. Self-bracket at frame 0 when called with none already open, rather
 * than throwing — frame 0 is inert for fonts specifically (they're pinned at
 * `cacheAt: 0, discardAt: null` regardless of the frame they're requested at,
 * see `buildAssetMap`), so only registering at all matters, not which frame.
 */
export class TrackMeasureScope extends MeasureScope {
    constructor(
        private readonly real: MeasureScope,
        private readonly tracker: AssetTracker,
    ) {
        super();
    }

    measureText(
        text: string,
        fontSize: number,
        fontFamily: string,
        fontWeight?: number,
        letterSpacing?: number,
        fontStyle?: FontStyle,
    ): number {
        if (this.tracker.isActive) {
            this.tracker.requestFont(fontFamily, String(fontWeight ?? 400));
        } else {
            this.tracker.start(0);
            try {
                this.tracker.requestFont(fontFamily, String(fontWeight ?? 400));
            } finally {
                this.tracker.end();
            }
        }
        return this.real.measureText(text, fontSize, fontFamily, fontWeight, letterSpacing, fontStyle);
    }
}
