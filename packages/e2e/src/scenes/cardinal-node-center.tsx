import { createRef, Rect, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Cardinal points: a marker dot is pinned to the `center` of a moving card via a
 * reactive accessor, so it tracks the card's center as the card animates.
 */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <>
            <Rect ref={card} width={300} height={200} cornerRadius={18} fill={'card'} x={-200} />
            <Ellipse width={36} height={36} fill={'accent'} center={() => card().center} />
        </>,
    );
}, [
    () => card().to({ x: 200, rotation: 20 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
