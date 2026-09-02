import { createRef, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Ellipse}'s `start`/`end` trim props (0..1) sweeping a stroked ring open from a single point into a full circle. */
const ring = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Ellipse
            ref={ring}
            width={300}
            height={300}
            stroke={{ weight: 16, cap: 'round', fill: 'primary' }}
            start={0}
            end={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => ring().to({ end: 1 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
