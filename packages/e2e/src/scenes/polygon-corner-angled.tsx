/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygon, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Polygon.cornerStyle} `'angled'`: a rounded hexagon chamfers into flat-cut corners mid-tween. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const hexagon = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={hexagon}
            width={280}
            height={280}
            sides={6}
            cornerRadius={60}
            cornerStyle={'rounded'}
            fill={'primary'}
            center={() => stage.root.center}
        />,
    );

    yield* hexagon().to({ cornerStyle: 'angled' }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
