/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygram, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A 6-point star (polygram, default ratio) spinning into view. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const star = createRef<Polygram>();
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={6}
            fill={'primary'}
            rotation={-90}
            scale={0.6}
            center={() => stage.root.center}
        />,
    );

    yield* star().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back'));
    yield* holdTail(1.3);
});
