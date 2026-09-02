import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Uniform scale animation on a centered square. */
const box = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={box} width={180} height={180} cornerRadius={18} fill={'primary'} scale={0.4} />
        </Rect>,
    );
}, [
    () => box().to({ scale: 1.4 }, 1.3, easeInOut('cubic')),
    holdTail(1.3),
]);
