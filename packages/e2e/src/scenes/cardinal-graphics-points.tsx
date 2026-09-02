import { createRef, Rect, Text, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A card's resolved cardinal points (`topLeft`, `topCenter`, ..., `bottomRight`) tracked live by a marker that hops between them as the card rotates and scales. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    const marker = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={card} width={300} height={180} cornerRadius={16} fill={'card'} rotation={0} />
            <Rect ref={marker} width={16} height={16} cornerRadius={8} fill={'primary'} center={() => card().topRight} />
        </Rect>,
    );
}, [
    () => card().to({ rotation: 35, scale: 1.2 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
