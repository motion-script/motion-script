import { createScene, createRef, Line, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Open {@link Line}: an unclosed zig-zag polyline, revealed end-to-end via `end`. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const zigzag = createRef<Line>();
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

    yield* zigzag().to({ end: 1 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
