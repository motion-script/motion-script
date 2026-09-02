import { createRef, LineGrid, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Basic {@link LineGrid}: a fixed 480×480 rect of major division lines with a
 * card fill behind them. Panning `origin` scrolls the grid — lines wrap and
 * tile so the rect always stays full — which gives a clearly moving mid frame.
 */
const grid = createRef<LineGrid>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

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
}, [
    // Pan one full cell diagonally; the grid tiles to stay full as it scrolls.
    () => grid().to({ offset: { x: 80, y: 80 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
