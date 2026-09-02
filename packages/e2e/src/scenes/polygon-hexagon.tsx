import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A regular hexagon (`sides={6}`) spinning into view. */
const hexagon = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={hexagon}
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
    () => hexagon().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back')),
    holdTail(1.3),
]);
