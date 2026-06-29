/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, LineGrid, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * Basic {@link LineGrid}: a fixed 480×480 rect of major division lines with a
 * card fill behind them. Panning `origin` scrolls the grid — lines wrap and
 * tile so the rect always stays full — which gives a clearly moving mid frame.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const grid = createRef<LineGrid>();
    stage.add(
        <LineGrid
            ref={grid}
            width={480}
            height={480}
            divisions={6}
            fill={Fills.color('card')}
            stroke={{ weight: 4, fill: 'primary' }}
            shadow={{ fill: Fills.color('black', { opacity: 0.5 }), offset: { x: 0, y: 12 }, blur: 28 }}
        />,
    );

    // Pan one full cell diagonally; the grid tiles to stay full as it scrolls.
    yield* grid().to({ origin: { x: 80, y: 80 } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
