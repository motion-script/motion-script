import { Rect, RectProps, type NodeConfig, property } from "motion-script";

// `seed` is inherited from RectProps/Node2DProps; a swatch works without one (it
// falls back to the default seed-0 source). NodeConfig makes every prop optional
// at the JSX call site, so no redeclaration is needed here.
export type RandomSwatchProps = RectProps;

const PALETTE = ["#E8617C", "#6990DD", "#F5C26B", "#7FD1AE", "#C58BE8"];

/**
 * A swatch that paints *itself* from `this.random` — the per-node seeded source
 * every `Node2D` carries, no `Random` threaded in from the stage.
 *
 * All draws happen in the **constructor**: the swatch needs no inherited context,
 * only its `seed` prop, so it composes its own look at construction. The base
 * constructor already adopts the `seed` prop as `this.random`'s origin, and the
 * runtime rebuilds the node each playback pass, so the same seed reproduces the
 * identical colour + corner radius across scrub / precomp / HMR — deterministic
 * without any per-pass rewind, and distinct per seed for a varied grid.
 */
export class RandomSwatch extends Rect<RandomSwatchProps> {
    @property({ default: undefined }) declare readonly seed?: string | number;

    constructor(props: NodeConfig<RandomSwatch, RandomSwatchProps>) {
        super(props);
        // Draws from this node's own source (seeded from the `seed` prop by the base
        // constructor): a palette colour and a corner radius.
        this.fill = PALETTE[this.random.nextInt(0, PALETTE.length)];
        this.cornerRadius = this.random.nextInt(4, 48);
    }
}
