import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Open {@link Line}: an unclosed zig-zag polyline, revealed end-to-end via `end`. */
const zigzag = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={zigzag}
            points={[
                { x: -300, y: 0 },
                { x: -150, y: 120 },
                { x: 0, y: -80 },
                { x: 150, y: 120 },
                { x: 300, y: 0 },
            ]}
            closed={false}
            fill={'transparent'}
            stroke={{ weight: 8, fill: 'accent', cap: 'round', join: 'round' }}
            start={0}
            end={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => zigzag().to({ end: 1 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
