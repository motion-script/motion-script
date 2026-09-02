import { createRef, Rect, linear } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect.pivot} set to a corner (`{x:0, y:1}` in unit space — top-left): rotation now swings the card around that corner instead of its center, like a page turning. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect
            ref={card}
            width={240}
            height={120}
            cornerRadius={16}
            fill={'primary'}
            pivot={{ x: 0, y: 1 }}
            rotation={0}
        />,
    );
}, [
    () => card().to({ rotation: 360 }, 1.6, linear()),
    holdTail(1.6),
]);
