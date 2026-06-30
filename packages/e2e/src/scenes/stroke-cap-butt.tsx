import { createScene, createRef, Line, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `cap: 'butt'` (the default): an open stroke's ends are flush, with no extension past the path's terminal points. The weight thickens so the flat-cut ends read clearly. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const line = createRef<Line>();
    stage.add(
        <Line
            ref={line}
            points={[{ x: -260, y: 0 }, { x: 260, y: 0 }]}
            stroke={{ weight: 8, fill: 'primary', cap: 'butt' }}
            center={() => stage.root.center}
        />,
    );

    yield* line().strokeTo({ weight: 60, fill: 'primary', cap: 'butt' }, 1.2, { ease: easeInOut('quad') });
    yield* holdTail(1.2);
});
