import { createRef, Polygon, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Polygon.cornerStyle} `'angled'`: a rounded hexagon chamfers into flat-cut corners mid-tween. */
const hexagon = createRef<Polygon>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Polygon
            ref={hexagon}
            width={280}
            height={280}
            sides={6}
            cornerRadius={60}
            cornerStyle={'rounded'}
            fill={'primary'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => hexagon().to({ cornerStyle: 'angled' }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
