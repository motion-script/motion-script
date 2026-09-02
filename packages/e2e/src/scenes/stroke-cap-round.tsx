import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `cap: 'round'`: an open stroke's ends extend into a semicircle past the path's terminal points, growing more visible as the weight thickens. */
const line = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={line}
            points={[{ x: -260, y: 0 }, { x: 260, y: 0 }]}
            stroke={{ weight: 8, fill: 'primary', cap: 'round' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => line().strokeTo({ weight: 60, fill: 'primary', cap: 'round' }, 1.2, { ease: easeInOut('quad') }),
    holdTail(1.2),
]);
