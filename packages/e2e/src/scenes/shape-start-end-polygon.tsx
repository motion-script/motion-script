import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Polygon}'s `start`/`end` trim props (0..1) sweeping a stroked hexagon's outline from a single point into a complete loop. */
const hex = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={hex}
            sides={6}
            width={280}
            height={280}
            stroke={{ weight: 14, cap: 'round', join: 'round', fill: 'primary' }}
            start={0}
            end={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => hex().to({ end: 1 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
