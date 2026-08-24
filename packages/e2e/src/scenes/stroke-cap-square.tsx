import { createScene, createRef, Line, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `cap: 'square'`: an open stroke's ends extend by half the weight past the path's terminal points, like `'butt'` but squared off further out. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const line = createRef<Line>();
    stage.add(
        <Line
            ref={line}
            points={[{ x: -260, y: 0 }, { x: 260, y: 0 }]}
            stroke={{ weight: 8, fill: 'primary', cap: 'square' }}
            center={() => stage.canvas.center}
        />,
    );

    yield* line().strokeTo({ weight: 60, fill: 'primary', cap: 'square' }, 1.2, { ease: easeInOut('quad') });
    yield* holdTail(1.2);
});
