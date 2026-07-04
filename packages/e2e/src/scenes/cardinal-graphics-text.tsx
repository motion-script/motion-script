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

interface PivotTextProps extends ShapeProps {
    anchor: Alignment;
}

/**
 * Draws a `Graphics().text({ pivot, x: 0, y: 0 })` label plus a marker dot at
 * the drawn origin. Text has no authored `width`/`height` (it auto-sizes to its
 * shaped content), so this is the case the pivot fix had to cover separately
 * from a box shape: the named corner/edge of the *shaped* text should still
 * land exactly on the marker.
 */
class PivotText extends ShapeNode<PivotTextProps> {
    @property({ default: 'center', mapper: (v: Alignment) => resolvePivot(v) })
    declare readonly anchor: Alignment;

    constructor(props: NodeConfig<PivotText, PivotTextProps>) {
        super(props);
    }

    // Register the font before first paint — a raw `Graphics().text()` draw call
    // (unlike the `Text` node) has no built-in font dependency declaration, so
    // without this the glyphs can render blank on a cold font cache.
    override prepareLayout(storage: Parameters<ShapeNode<PivotTextProps>['prepareLayout']>[0]): void {
        super.prepareLayout(storage);
        storage.requestFont('Inter', '400');
    }

    protected renderSelf(draw: RenderContext): void {
        const label = new Graphics()
            .text({ text: 'Hello', fontFamily: 'Inter', fontSize: 28, pivot: this.anchor, x: 0, y: 0 })
            .fill('primary');
        draw.draw(label);

        const marker = new Graphics()
            .ellipse({ width: 10, height: 10, x: 0, y: 0 })
            .fill('accent');
        draw.draw(marker);
    }
}

/**
 * `Graphics().text({ pivot, x: 0, y: 0 })` for all nine named anchors: with no
 * cardinal-anchor shorthand and no authored box, a plain `pivot` combined with
 * `x`/`y` should still land that named corner/edge of the *shaped* text on
 * `(x, y)` — the marker dot. One cell per anchor in a 3x3 grid.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const cells = ANCHORS.map((anchor) => (
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }} fill={'card'} cornerRadius={12}>
            <PivotText anchor={anchor} />
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
