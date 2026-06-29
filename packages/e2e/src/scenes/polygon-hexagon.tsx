/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygon, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A regular hexagon (`sides={6}`) spinning into view. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const hexagon = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={hexagon}
            width={300}
            height={300}
            sides={6}
            fill={'primary'}
            rotation={-90}
            scale={0.6}
            center={() => stage.root.center}
        />,
    );

    yield* hexagon().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back'));
    yield* holdTail(1.3);
});
