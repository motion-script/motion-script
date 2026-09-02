import { createRef, Polygram, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Polygram.cornerRadius}: a sharp 5-point star rounding both its inner and outer vertices. */
const star = createRef<Polygram>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={5}
            cornerRadius={0}
            fill={'accent'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => star().to({ cornerRadius: 24 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
