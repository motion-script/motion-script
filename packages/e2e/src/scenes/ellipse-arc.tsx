import { createRef, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Ellipse arc stroke: `sweep` animating from a quarter-turn to a near-full circle. */
const arc = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Ellipse
            ref={arc}
            width={300}
            height={300}
            startAngle={-90}
            sweep={90}
            fill={'transparent'}
            stroke={{ weight: 16, fill: 'primary', cap: 'round' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => arc().to({ sweep: 300 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
