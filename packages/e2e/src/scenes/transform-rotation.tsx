import { createRef, Rect, linear } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A shape spinning a full rotation around its center. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={220} height={220} cornerRadius={24} fill={'accent'} rotation={0} />
        </Rect>,
    );
}, [
    () => rect().to({ rotation: 360 }, 1.8, linear()),
    holdTail(1.8),
]);
