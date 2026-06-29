/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygram, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Polygram.ratio}: a sharp-pointed star blunting toward a near-regular polygon as ratio approaches 1. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const star = createRef<Polygram>();
    stage.add(
        <Polygram
            ref={star}
            width={300}
            height={300}
            sides={5}
            ratio={0.35}
            fill={'accent'}
            center={() => stage.root.center}
        />,
    );

    yield* star().to({ ratio: 0.9 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
