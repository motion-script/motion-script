import {
    createScene, createSignal, parallel, Rect, ShapeNode, ShapeProps, NodeConfig, RenderContext2D, Graphics2D,
    AnchorKey, Anchor, property, resolveAnchor, easeInOut,
} from 'motion-script';
import { holdTail } from './_lib';

/** All nine named anchors, laid out to mirror their on-screen meaning. */
const ANCHORS: AnchorKey[] = [
    'topLeft', 'topCenter', 'topRight',
    'centerLeft', 'center', 'centerRight',
    'bottomLeft', 'bottomCenter', 'bottomRight',
];

interface PivotPolygonProps extends ShapeProps {
    anchor: Anchor;
    shapeRotation: number;
    shapeScale: number;
}

/**
 * Draws a `Graphics2D().polygon({ pivot, x: 0, y: 0, rotation, scale })`
 * triangle (an asymmetric silhouette so rotation reads clearly) plus a marker
 * dot at the drawn origin: the named corner/edge of the polygon's bounding box
 * stays pinned to the marker as the shape turns and grows about that same
 * pivot.
 */
class PivotPolygon extends ShapeNode<PivotPolygonProps> {
    @property({ default: 'center', mapper: (v: Anchor) => resolveAnchor(v) })
    declare readonly anchor: Anchor;
    @property({ default: 0 }) declare readonly shapeRotation: number;
    @property({ default: 1 }) declare readonly shapeScale: number;

    constructor(props: NodeConfig<PivotPolygon, PivotPolygonProps>) {
        super(props);
    }

    protected renderSelf(draw: RenderContext2D): void {
        const tri = new Graphics2D()
            .polygon({
                width: 70, height: 70, sides: 3, pivot: this.anchor, x: 0, y: 0,
                rotation: this.shapeRotation, scale: this.shapeScale,
            })
            .fill('primary');
        draw.draw(tri);

        const marker = new Graphics2D()
            .ellipse({ width: 10, height: 10, x: 0, y: 0 })
            .fill('accent');
        draw.draw(marker);
    }
}

/**
 * `Graphics2D().polygon({ pivot, x: 0, y: 0 })` for all nine named anchors,
 * animating the descriptor's own `rotation`/`scale` (not the node-level
 * transform): with no cardinal-anchor shorthand, a plain `pivot` combined with
 * `x`/`y` should still land that named corner/edge of the polygon's bounding
 * box on `(x, y)` and keep it pinned there under motion. One cell per anchor in
 * a 3x3 grid.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const rotation = createSignal(0);
    const scale = createSignal(1);

    const cells = ANCHORS.map((anchor) => (
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }} fill={'card'} cornerRadius={12}>
            <PivotPolygon anchor={anchor} shapeRotation={rotation} shapeScale={scale} />
        </Rect>
    ));

    const rows = [0, 1, 2].map((r) => (
        <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={20}>
            {cells.slice(r * 3, r * 3 + 3)}
        </Rect>
    ));

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={24} gap={20}>
            {rows}
        </Rect>,
    );

    yield* parallel(
        rotation(360, 1.6, easeInOut('quad')),
        scale(1.3, 1.6, easeInOut('quad')),
    );
    yield* holdTail(1.6);
});
