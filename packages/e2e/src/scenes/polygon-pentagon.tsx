import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A regular pentagon (`sides={5}`, the default) spinning into view. */
const pentagon = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={pentagon}
            width={300}
            height={300}
            sides={5}
            fill={'accent'}
            rotation={-90}
            scale={0.6}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => pentagon().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back')),
    holdTail(1.3),
]);
