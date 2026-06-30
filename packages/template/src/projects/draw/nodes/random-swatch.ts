import { Rect, RectProps, type NodeConfig, property } from "motion-script";

export interface RandomSwatchProps extends RectProps {
    /**
     * Optional seed. Omitted → the node's default `Random` (seed `0`), so two
     * unseeded swatches paint identically. Provide a distinct seed (e.g. the
     * grid index) to give each swatch its own reproducible look.
     */
    seed?: string | number;
}

const PALETTE = ["#E8617C", "#6990DD", "#F5C26B", "#7FD1AE", "#C58BE8"];

/**
 * A swatch that paints *itself* from `this.random` — the per-node seeded source
 * every `Node` now carries, no `Random` threaded in from the stage.
 *
 * All draws happen in {@link init} (the recommended hook, where the node already
 * exists in the tree). `super.init()` rewinds `this.random` first, so the same
 * seed reproduces the identical colour + corner radius on every playback pass
 * (scrub / precomp / HMR). Passing a `seed` prop re-seeds via
 * `this.random.reset(seed)` — equivalently `this.random.seed = seed` — so each
 * swatch in a grid can vary while staying deterministic.
 */
export class RandomSwatch extends Rect<RandomSwatchProps> {
    @property({ default: undefined }) declare readonly seed?: string | number;

    protected override init(props?: NodeConfig<RandomSwatch, RandomSwatchProps>): void {
        // Re-seed (and rewind) from the seed prop when given; otherwise the base
        // rewind keeps the default seed-0 source reproducible across passes.
        if (this.seed !== undefined) this.random.reset(this.seed);
        else super.init(props);

        // Draws from this node's own source: a palette colour and a corner radius.
        this.fill = PALETTE[this.random.nextInt(0, PALETTE.length)];
        this.cornerRadius = this.random.nextInt(4, 48);
    }
}
