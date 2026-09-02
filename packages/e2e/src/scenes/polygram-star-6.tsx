import { createRef, Polygram, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A 6-point star (polygram, default ratio) spinning into view. */
const star = createRef<Polygram>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={6}
            fill={'primary'}
            rotation={-90}
            scale={0.6}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => star().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back')),
    holdTail(1.3),
]);
