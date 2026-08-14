import {
    createScene, Text, Rect, Fills, AnchorKey,
    wait,
} from "motion-script";
import { TextDrawShape } from "../nodes/text-draw-shape";

/** Gradient shared by every cell so only the text alignment differs. */
const GRADIENT = ['#6990DD', '#E8617C', '#F5C26B'];

/**
 * Shows every named {@link AnchorKey} passed as `textAlignment` on
 * {@link TextDrawShape} — the pivot handed to `Graphics.text({ pivot, ... })`.
 *
 * Text contributes no measurable bounds to a Graphics union, so `pivot` is the
 * only lever that steers which point of the text sits at its drawn origin
 * (`x: 0, y: 0`). One cell per anchor, laid out in the same 3×3 grid as
 * {@link ../scenes/shape-pivot.tsx}, with a ✕ marking the drawn origin so the
 * anchor's effect on the text reads at a glance (e.g. `topLeft` tucks the
 * text's top-left corner onto the origin, so the text sits down-and-right of
 * it; `bottomRight` does the opposite).
 *
 * Static (no animation): it's a placement-correctness check, read at a glance.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    // All nine cardinal anchors, laid out in a 3×3 grid mirroring their meaning.
    const anchors: AnchorKey[] = [
        'topLeft', 'topCenter', 'topRight',
        'centerLeft', 'center', 'centerRight',
        'bottomLeft', 'bottomCenter', 'bottomRight',
    ];

    const textFill = Fills.linearGradient(GRADIENT, {
        space: 'local', start: { x: -1, y: 0 }, end: { x: 1, y: 0 },
    });

    const cells = anchors.map((anchor) => (
        <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={12}>
            <Text
                fontFamily={'Pixelify Sans'} text={anchor}
                fontSize={36} fill={'gray'} width={'fill'} textAlign={'center'}
            />
            <Rect width={'fill'} height={'fill'} clip={true} cornerRadius={24} flow={'freeform'} fill={'card'}>
                <TextDrawShape
                    textAlignment={anchor} fill={textFill}
                    stroke={{ weight: 3, fill: Fills.color('#0D0F15', { opacity: 0.6 }) }}
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
            <Text fontFamily={'Pixelify Sans'} text={'Graphics text — pivot anchors'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={32}>
                {rows}
            </Rect>
        </Rect>
    );
    yield* wait(2);
});
