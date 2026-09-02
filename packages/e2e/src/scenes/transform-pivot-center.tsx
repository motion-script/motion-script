import { createRef, Rect, linear } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Default pivot (the node's center): rotation spins the card in place around its own midpoint. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={240} height={120} cornerRadius={16} fill={'primary'} rotation={0} center={() => stage.canvas.center} />,
    );
}, [
    () => card().to({ rotation: 360 }, 1.6, linear()),
    holdTail(1.6),
]);
