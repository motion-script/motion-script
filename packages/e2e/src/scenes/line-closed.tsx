import { createRef, Line, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Closed {@link Line}: a pentagon outline traced with `end`, then the loop seals shut. */
const pentagon = createRef<Line>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Line
            ref={pentagon}
            points={[
                { x: 0, y: 140 },
                { x: 133, y: 43 },
                { x: 82, y: -113 },
                { x: -82, y: -113 },
                { x: -133, y: 43 },
            ]}
            closed={true}
            fill={'transparent'}
            stroke={{ weight: 8, fill: 'primary', join: 'round' }}
            start={0}
            end={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => pentagon().to({ end: 1 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
