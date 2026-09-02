import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Line}'s `start`/`end` trim props (0..1) drawing a zigzag path on progressively from nothing to fully traced. */
const line = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={line}
            points={[
                { x: -280, y: 80 },
                { x: -140, y: -80 },
                { x: 0, y: 80 },
                { x: 140, y: -80 },
                { x: 280, y: 80 },
            ]}
            stroke={{ weight: 12, cap: 'round', join: 'round', fill: 'primary' }}
            start={0}
            end={0}
        />,
    );
}, [
    () => line().to({ end: 1 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
