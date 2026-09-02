import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A satellite node's `center` pinned to the card's `bottomRight` anchor, following it as the card grows. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={card} width={220} height={140} cornerRadius={16} fill={'card'} />
            <Rect width={20} height={20} cornerRadius={10} fill={'primary'} center={() => card().bottomRight} />
        </Rect>,
    );
}, [
    () => card().to({ width: 360, height: 240 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
