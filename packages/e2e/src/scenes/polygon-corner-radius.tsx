import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Polygon.cornerRadius}: a sharp-cornered pentagon rounding its vertices into smooth arcs. */
const pentagon = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={pentagon}
            width={280}
            height={280}
            sides={5}
            cornerRadius={0}
            fill={'accent'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => pentagon().to({ cornerRadius: 50 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
