import { createRef, Polygram, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Polygram.ratio}: a sharp-pointed star blunting toward a near-regular polygon as ratio approaches 1. */
const star = createRef<Polygram>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={5}
            ratio={0.35}
            fill={'accent'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => star().to({ ratio: 0.9 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
