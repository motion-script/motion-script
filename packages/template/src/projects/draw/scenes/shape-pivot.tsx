import {
    createScene, Text, Rect, Fills, AnchorKey,
} from "motion-script";
import { DrawnShapePivot } from "../nodes/drawn-shape-pivot";

/** Gradient shared by every rect so only the anchor differs between cells. */
const GRADIENT = ['#6990DD', '#E8617C', '#F5C26B'];

/**
 * Tests the **cardinal-point positioning API** on `Graphics` shapes —
 * `new Graphics().rect({ topRight: { x, y }, width, height })` and friends.
 *
 * One cell per cardinal anchor (`center`, `topLeft`, `topRight`, …). In each, a
 * rect is positioned *only* by that anchor onto a fixed off-centre target, and a
 * ✕ is drawn independently at the same target. The test passes when the rect's
 * named corner/edge lands exactly on the ✕ in every cell — e.g. in the `topRight`
 * cell the rect's top-right corner sits on the ✕, in `bottomLeft` its bottom-left
 * corner does, and in `center` the ✕ sits at the rect's middle.
 *
 * Static (no animation): it's a placement-correctness check, read at a glance.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const e = 150;

    // All nine cardinal anchors, laid out in a 3×3 grid mirroring their meaning.
    const anchors: AnchorKey[] = [
        'topLeft',    'topCenter',    'topRight',
        'centerLeft', 'center',       'centerRight',
        'bottomLeft', 'bottomCenter', 'bottomRight',
    ];

    // A single off-centre target every cell pins its anchor to, so the placement
    // difference between anchors is obvious (the rect leans toward the opposite
    // side of its named corner).
    const target = { x: e * 0.25, y: e * 0.2 };

    const figureFill = Fills.linearGradient(GRADIENT, {
        space: 'local', start: { x: 0, y: 1 }, end: { x: 0, y: -1 },
    });

    const cells = anchors.map((anchor) => (
        <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
            <Text
                fontFamily={'Pixelify Sans'} text={anchor}
                fontSize={36} fill={'gray'} width={'fill'} textAlign={'center'}
            />
            <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={24} flow={'freeform'} fill={'card'}>
                <DrawnShapePivot
                    extent={e} anchor={anchor} target={target} fill={figureFill}
                    stroke={{ weight: 4, fill: Fills.color('#0D0F15', { opacity: 0.6 }) }}
                />
            </Rect>
        </Rect>
    ));

    const rows = [0, 1, 2].map((r) => (
        <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={32}>
            {cells.slice(r * 3, r * 3 + 3)}
        </Rect>
    ));

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={64} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'Graphics shape — cardinal anchors'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={32}>
                {rows}
            </Rect>
        </Rect>
    );
});
