import { createRef, Ellipse, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Ellipse at a 1:1 ratio (a circle), popping in with a scale. */
const circle = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Ellipse
            ref={circle}
            width={280}
            height={280}
            ratio={1}
            fill={'accent'}
            scale={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => circle().to({ scale: 1 }, 0.9, easeOut('back')),
    holdTail(0.9),
]);
