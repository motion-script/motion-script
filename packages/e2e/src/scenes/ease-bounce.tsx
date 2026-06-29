/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Ellipse, easeOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A ball dropping with an easeOut('bounce') landing — the classic bounce curve. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const ball = createRef<Ellipse>();
    stage.add(<Ellipse ref={ball} width={110} height={110} fill={'accent'} x={0} y={-200} />);

    yield* ball().to({ y: 180 }, 1.5, easeOut('bounce'));
    yield* holdTail(1.5);
});
