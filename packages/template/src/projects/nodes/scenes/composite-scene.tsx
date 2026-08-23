

import {
    createScene,
    createRef,
    Node2D,
    Node2DProps,
    NodeConfig,
    Rect,
    Text,
    easeInOut,
    wait,
} from "motion-script";
import { nodeCard } from "./node-card";

interface BadgeGroupProps extends Node2DProps {
    /** Labels to build a tile for — one regular child node per entry. */
    labels: string[];
}

/**
 * A custom composite node — it extends {@link Node2D} and draws *nothing* of its
 * own (no `renderSelf`, no `Graphics2D`). Instead it **builds its own regular node
 * children right in the constructor** via {@link Node2D.add}: given a list of
 * `labels` (a prop — structure comes from props), it constructs a `Rect` row of
 * coloured tiles, each with a `Text`. From the scene's point of view it's a
 * single self-contained node — the standard nodes it's composed of are an
 * internal detail it owns.
 *
 * No context is needed to build the tiles, so composition belongs in the
 * constructor: it runs once per instance, so there is no accumulation to guard
 * against and no `clearChildren`. (A composite that needs *inherited context* to
 * fill in values would still build its structure here and override
 * {@link Node2D.resolveContext} to apply those values via refs.)
 */
class BadgeGroup extends Node2D<BadgeGroupProps> {
    // A handle to the internal row so the scene can animate the composite's
    // layout (gap) without reaching into its children by index. (Not named
    // `row` — that collides with Node2DProps' grid-placement `row: number`.)
    readonly rowRef = createRef<Rect>();

    private static readonly COLORS = ['#6990DD', '#E8617C', '#F5C26B', '#7FB77E', '#B98DDA'];

    constructor(props?: NodeConfig<BadgeGroup, BadgeGroupProps>) {
        super(props);
        // `labels` is a plain config value (structure, not a per-frame prop), so
        // resolve a callback form eagerly and build the subtree once, here.
        const raw = props?.labels;
        const labels = typeof raw === 'function' ? raw() : raw ?? [];

        this.add(
            <Rect ref={this.rowRef} flow={'horizontal'} gap={32}>
                {labels.map((label, i) => (
                    <Rect
                        width={180}
                        height={180}
                        fill={BadgeGroup.COLORS[i % BadgeGroup.COLORS.length]}
                        cornerRadius={24}
                        flow={'freeform'}
                    >
                        <Text
                            fontFamily={'Pixelify Sans'}
                            text={label}
                            fontSize={56}
                            fill={'bg'}
                        />
                    </Rect>
                ))}
            </Rect>
        );
    }
}

/**
 * Showcases a **custom composite node** that assembles its own children.
 * `BadgeGroup` is a user-defined {@link Node2D} subclass that draws nothing itself;
 * it builds a row of regular tile nodes internally in `init`. The scene just
 * drops the one node in and animates its internal row's gap.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const badgeRef = createRef<BadgeGroup>();

    stage.add(
        nodeCard({
            label: 'Composite',
            stage: 'freeform',
            children: (
                <BadgeGroup ref={badgeRef} labels={['A', 'B', 'C', 'D']} />
            ),
        })
    );

    // Animate the composite's internal layout through its exposed row handle.
    yield* badgeRef().rowRef().to({ gap: 80 }, 1.2, easeInOut('quad'));
    yield* badgeRef().rowRef().to({ gap: 32 }, 1.0, easeInOut('quad'));

    yield* wait(0.5);
});
