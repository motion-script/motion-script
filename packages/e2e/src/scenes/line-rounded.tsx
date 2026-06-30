import { createScene, createRef, Line, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Line.radius}: a sharp-cornered zig-zag rounding its vertices into smooth arcs. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const line = createRef<Line>();
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
            center={() => stage.root.center}
        />,
    );

    yield* line().to({ radius: 60 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
