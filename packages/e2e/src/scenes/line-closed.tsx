import { createScene, createRef, Line, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Closed {@link Line}: a pentagon outline traced with `end`, then the loop seals shut. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const pentagon = createRef<Line>();
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

    yield* pentagon().to({ end: 1 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
