import { createScene, createRef, NumberNode, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'currency'}`: a dollar amount counting up from 0. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const amount = createRef<NumberNode>();
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

    yield* amount().countTo(1234.5, 1.5, easeOut('cubic'));
    yield* holdTail(1.5);
});
