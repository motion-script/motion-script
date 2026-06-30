import { createScene, createRef, Rect, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Cardinal points: a marker dot is pinned to the `center` of a moving card via a
 * reactive accessor, so it tracks the card's center as the card animates.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <>
            <Rect ref={card} width={300} height={200} cornerRadius={18} fill={'card'} x={-200} />
            <Ellipse width={36} height={36} fill={'accent'} center={() => card().center} />
        </>,
    );

    yield* card().to({ x: 200, rotation: 20 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
