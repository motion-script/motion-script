import { createRef, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Ellipse pie slice: a filled wedge with `sweep` opening from a sliver to a near-full circle. */
const pie = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Ellipse
            ref={pie}
            width={300}
            height={300}
            startAngle={-90}
            sweep={20}
            fill={'accent'}
            stroke={{ weight: 3, fill: 'bg' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => pie().to({ sweep: 320 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
