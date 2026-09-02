import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `cap: 'square'`: an open stroke's ends extend by half the weight past the path's terminal points, like `'butt'` but squared off further out. */
const line = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={line}
            points={[{ x: -260, y: 0 }, { x: 260, y: 0 }]}
            stroke={{ weight: 8, fill: 'primary', cap: 'square' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => line().strokeTo({ weight: 60, fill: 'primary', cap: 'square' }, 1.2, { ease: easeInOut('quad') }),
    holdTail(1.2),
]);
