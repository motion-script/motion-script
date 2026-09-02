import { createRef, NumberNode, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'currency'}`: a dollar amount counting up from 0. */
const amount = createRef<NumberNode>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <NumberNode
            ref={amount}
            value={0}
            format={'currency'}
            currencyCode={'USD'}
            locale={'en-US'}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={72}
            fill={'primary'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => amount().countTo(1234.5, 1.5, easeOut('cubic')),
    holdTail(1.5),
]);
