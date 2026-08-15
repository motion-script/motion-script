

import {
    createScene,
    createRef,
    Node,
    NodeProps,
    Ellipse,
    Text,
    BoxBounds,
    Measurer,
    easeInOut,
    parallel,
    wait,
    property,
} from "motion-script";
import { nodeCard } from "./node-card";

interface FanNodeProps extends NodeProps {
    /** Total sweep, in degrees, the children are fanned across. */
    spread: number;
    /** Distance, in pixels, from the fan's centre to each child's own centre. */
    radius: number;
}

/**
 * A custom composite node — it extends {@link Node} and draws *nothing* of its
 * own (no `renderSelf`, no `Graphics`). Its only job is to arrange whatever
 * regular node children it's given: it fans them out evenly along an arc,
 * centred on its own box, so the standard children (Rects, Ellipses, …) become
 * the visible content while this node just governs their placement.
 *
 * `spread` (arc sweep) and `radius` are reactive props, so the composite can be
 * animated with `to()` like any built-in node and its children reflow to match.
 */
class FanNode extends Node<FanNodeProps> {
    @property({ default: 180 }) declare spread: number;
    @property({ default: 220 }) declare radius: number;

    // No `measure` override: the base Node already resolves this container's
    // width/height (here `'fill'`) against the box the card allots it. We only
    // override `layout` to fan the children inside that box.
    override layout(rect: BoxBounds, scope: Measurer): void {
        this.setLayoutRect(rect);

        const kids = this.children;
        const count = kids.length;
        const spread = (this.spread * Math.PI) / 180;
        const radius = this.radius;

        kids.forEach((child, i) => {
            // Spread the children evenly across the arc; a single child sits
            // dead centre. Angle 0 points up, sweeping symmetrically left↔right.
            const t = count > 1 ? i / (count - 1) - 0.5 : 0;
            const angle = t * spread;
            const x = Math.sin(angle) * radius;
            const y = Math.cos(angle) * radius - radius; // 0 at centre, arcs downward

            const size = child.measure({ maxWidth: rect.width, maxHeight: rect.height }, scope);
            child.layout(
                { x, y: -y, width: size.width ?? 0, height: size.height ?? 0 },
                scope,
            );
        });
    }
}

/**
 * Showcases a **custom composite node**. `FanNode` is a user-defined subclass of
 * {@link Node} with no rendering of its own — it holds regular built-in node
 * children (Ellipses with Text labels) and lays them out along an arc. The scene
 * animates the composite's `spread` and `radius`, and the children reflow as one.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const fanRef = createRef<FanNode>();
    const colors = ['#6990DD', '#E8617C', '#F5C26B', '#7FB77E', '#B98DDA'];

    stage.add(
        nodeCard({
            label: 'Composite',
            stage: 'freeform',
            children: (
                <FanNode ref={fanRef} width={'fill'} height={'fill'} spread={160} radius={260}>
                    {colors.map((color, i) => (
                        <Ellipse width={140} height={140} fill={color}>
                            <Text
                                fontFamily={'Pixelify Sans'}
                                text={`${i + 1}`}
                                fontSize={56}
                                fill={'bg'}
                            />
                        </Ellipse>
                    ))}
                </FanNode>
            ),
        })
    );

    // The custom node animates like any built-in — its children reflow together.
    yield* fanRef().to({ spread: 60, radius: 320 }, 1.2, easeInOut('quad'));
    yield* parallel(
        fanRef().to({ spread: 220 }, 1.2, easeInOut('quad')),
        fanRef().to({ radius: 220 }, 1.2, easeInOut('quad')),
    );
    yield* fanRef().to({ spread: 160, radius: 260 }, 1.0, easeInOut('quad'));

    yield* wait(0.5);
});
