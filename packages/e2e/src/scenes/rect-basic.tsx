import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Rect with fixed width/height and a solid fill, gently scaling in. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={320} height={200} fill={'primary'} scale={0.6} />
        </Rect>,
    );
}, [
    () => rect().to({ scale: 1 }, 1, easeInOut('quad')),
    holdTail(1),
]);
