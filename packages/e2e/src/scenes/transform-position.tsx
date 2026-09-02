import { createRef, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A circle animating its x/y position across the viewport. */
const ball = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(<Ellipse ref={ball} width={120} height={120} fill={'primary'} x={-300} y={-120} />);
}, [
    () => ball().to({ x: 300, y: 120 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
