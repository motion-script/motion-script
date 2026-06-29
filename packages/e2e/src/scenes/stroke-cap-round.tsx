/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Line, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** `cap: 'round'`: an open stroke's ends extend into a semicircle past the path's terminal points, growing more visible as the weight thickens. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const line = createRef<Line>();
    stage.add(
        <Line
            ref={line}
            points={[{ x: -260, y: 0 }, { x: 260, y: 0 }]}
            stroke={{ weight: 8, fill: 'primary', cap: 'round' }}
            center={() => stage.root.center}
        />,
    );

    yield* line().strokeTo({ weight: 60, fill: 'primary', cap: 'round' }, 1.2, { ease: easeInOut('quad') });
    yield* holdTail(1.2);
});
