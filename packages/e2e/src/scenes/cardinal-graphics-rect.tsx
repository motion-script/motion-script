import {
    createScene, Rect, ShapeNode, ShapeProps, NodeConfig, RenderContext, Graphics,
    AlignKey, Alignment, property, resolvePivot,
} from 'motion-script';
import { holdTail } from './_lib';

/** All nine named anchors, laid out to mirror their on-screen meaning. */
const ANCHORS: AlignKey[] = [
    'topLeft', 'topCenter', 'topRight',
    'centerLeft', 'center', 'centerRight',
    'bottomLeft', 'bottomCenter', 'bottomRight',
];

interface PivotRectProps extends ShapeProps {
    anchor: Alignment;
}

/**
 * Draws a `Graphics().rect({ pivot, x: 0, y: 0 })` box plus a marker dot at the
 * drawn origin, so the anchor's effect on a plain `pivot` + `x`/`y` descriptor
 * (no cardinal-anchor shorthand) reads at a glance: the named corner/edge of the
 * box should land exactly on the marker.
 */
class PivotRect extends ShapeNode<PivotRectProps> {
    @property({ default: 'center', mapper: (v: Alignment) => resolvePivot(v) })
    declare readonly anchor: Alignment;

    constructor(props: NodeConfig<PivotRect, PivotRectProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext): void {
        const box = new Graphics()
            .rect({ width: 90, height: 60, cornerRadius: 10, pivot: this.anchor, x: 0, y: 0 })
            .fill('primary');
        draw.draw(box);

        const marker = new Graphics()
            .ellipse({ width: 10, height: 10, x: 0, y: 0 })
            .fill('accent');
        draw.draw(marker);
    }
}

/**
 * `Graphics().rect({ pivot, x: 0, y: 0 })` for all nine named anchors: with no
 * cardinal-anchor shorthand (`{ topRight: { x, y } }`), a plain `pivot` combined
 * with `x`/`y` should still land that named corner/edge of the box on `(x, y)` —
 * the marker dot. One cell per anchor in a 3x3 grid.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const cells = ANCHORS.map((anchor) => (
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }} fill={'card'} cornerRadius={12}>
            <PivotRect anchor={anchor} />
        </Rect>
    ));

    const rows = [0, 1, 2].map((r) => (
        <Rect width={'fill'} height={'fill'} group={'row'} gap={20}>
            {cells.slice(r * 3, r * 3 + 3)}
        </Rect>
    ));

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={24} gap={20}>
            {rows}
        </Rect>,
    );

    yield* holdTail(0);
});
