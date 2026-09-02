import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Position and scale transforming together with `opacity` fading in, in one combined tween — a typical "pop in while sliding" entrance. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={200} height={140} cornerRadius={20} fill={'primary'} center={{ x: 0, y: 120 }} scale={0.5} opacity={0} />,
    );
}, [
    () => card().to({ y: 0, scale: 1, opacity: 1 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
