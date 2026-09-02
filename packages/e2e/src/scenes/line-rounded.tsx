import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Line.radius}: a sharp-cornered zig-zag rounding its vertices into smooth arcs. */
const line = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={line}
            points={[
                { x: -260, y: -100 },
                { x: -80, y: 100 },
                { x: 80, y: -100 },
                { x: 260, y: 100 },
            ]}
            closed={false}
            radius={0}
            fill={'transparent'}
            stroke={{ weight: 14, fill: 'primary', cap: 'round' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => line().to({ radius: 60 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
