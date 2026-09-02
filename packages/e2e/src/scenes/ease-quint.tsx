import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link easeInOut}`('quint')`: a card slides across with the steepest power curve — long, slow edges and a near-snap through the middle. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={120} height={120} cornerRadius={16} fill={'primary'} center={{ x: -300, y: 0 }} />,
    );
}, [
    () => card().to({ x: 300 }, 1.2, easeInOut('quint')),
    0.2,
    holdTail(1.4),
]);
