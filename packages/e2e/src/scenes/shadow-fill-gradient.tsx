import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A shadow's `fill` is the same loose {@link Fill} type as a node's `fill` — here a colored gradient instead of a flat black. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={300}
                height={200}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={{ blur: 30, offset: { x: 0, y: 20 }, fill: Fills.linearGradient(['#6990dd', '#e8617c']) }}
            />
        </Rect>,
    );
}, [
    () => card().to(
        { shadow: { blur: 30, offset: { x: 0, y: 20 }, fill: Fills.linearGradient(['#f2c94c', '#e8617c']) } },
        1.4,
        easeInOut('quad'),
    ),
    holdTail(1.4),
]);
