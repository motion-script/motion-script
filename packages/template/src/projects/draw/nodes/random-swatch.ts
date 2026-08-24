import { Rect, RectProps, type NodeConfig, type Random, property } from "motion-script";

export interface RandomSwatchProps extends RectProps {
    /**
     * The seeded source this swatch draws its look from — `stage.random(seed)`.
     *
     * A node has no random source of its own. One that did would be reproducible
     * only for as long as nothing above it changed how many times it was built,
     * and "how many times a node was built" is exactly what a scrub, a precomp
     * pass and a hot reload all change. The stage's sources are rewound before
     * every replay, so a swatch handed one draws the same colour every pass.
     */
    random: Random;
}

const PALETTE = ["#E8617C", "#6990DD", "#F5C26B", "#7FD1AE", "#C58BE8"];

/**
 * A swatch that paints *itself* from a seeded source the scene hands it.
 *
 * Both draws happen in the **constructor**: the swatch needs no inherited
 * context, only its `random` prop, so it composes its own look at construction.
 * Pass a distinct `stage.random(key)` per swatch for a varied-but-deterministic
 * grid, or the same one to every swatch to watch them come out identical.
 */
export class RandomSwatch extends Rect<RandomSwatchProps> {
    @property({ default: undefined }) declare readonly random?: Random;

    constructor(props: NodeConfig<RandomSwatch, RandomSwatchProps>) {
        super(props);
        const random = props.random as Random | undefined;
        if (!random) return;
        this.fill = PALETTE[random.nextInt(0, PALETTE.length)];
        this.cornerRadius = random.nextInt(4, 48);
    }
}
