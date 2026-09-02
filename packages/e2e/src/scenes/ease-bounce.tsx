import { createRef, Ellipse, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A ball dropping with an easeOut('bounce') landing — the classic bounce curve. */
const ball = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(<Ellipse ref={ball} width={110} height={110} fill={'accent'} x={0} y={-200} />);
}, [
    () => ball().to({ y: 180 }, 1.5, easeOut('bounce')),
    holdTail(1.5),
]);
