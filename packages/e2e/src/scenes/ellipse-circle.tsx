/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Ellipse, easeOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** Ellipse at a 1:1 ratio (a circle), popping in with a scale. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Ellipse>();
    stage.add(
        <Ellipse
            ref={circle}
            width={280}
            height={280}
            ratio={1}
            fill={'accent'}
            scale={0}
            center={() => stage.root.center}
        />,
    );

    yield* circle().to({ scale: 1 }, 0.9, easeOut('back'));
    yield* holdTail(0.9);
});
