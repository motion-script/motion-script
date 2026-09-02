import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** An equilateral triangle (`sides={3}`) spinning into view. */
const triangle = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={triangle}
            width={300}
            height={300}
            sides={3}
            fill={'primary'}
            rotation={-90}
            scale={0.6}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => triangle().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back')),
    holdTail(1.3),
]);
