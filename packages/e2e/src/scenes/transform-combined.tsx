import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Position, rotation, and scale all animating together on one node in a single tween. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={160} height={160} cornerRadius={20} fill={'primary'} center={{ x: -260, y: 100 }} rotation={0} scale={0.6} />,
    );
}, [
    () => card().to({ x: 260, y: -100, rotation: 270, scale: 1.4 }, 1.6, easeInOut('quad')),
    holdTail(1.6),
]);
