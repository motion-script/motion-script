import { createRef, Rect, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link easeOut}`('elastic')`: a card springs to its target, oscillating like a rubber band before settling. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={120} height={120} cornerRadius={16} fill={'primary'} center={{ x: -300, y: 0 }} />,
    );
}, [
    () => card().to({ x: 300 }, 1.4, easeOut('elastic')),
    0.2,
    holdTail(1.6),
]);
