import { createRef, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Ellipse `ratio` (width-to-height) animating from a tall oval to a wide one. */
const ellipse = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Ellipse
            ref={ellipse}
            width={300}
            height={300}
            ratio={0.4}
            fill={'primary'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => ellipse().to({ ratio: 2.2 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
