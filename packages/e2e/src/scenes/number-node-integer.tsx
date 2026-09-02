import { createRef, NumberNode, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'number'}` with grouping: a counter ticking up to a large integer. */
const counter = createRef<NumberNode>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <NumberNode
            ref={counter}
            value={0}
            format={'number'}
            decimals={0}
            useGrouping={true}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={72}
            fill={'accent'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => counter().countTo(48291, 1.5, easeOut('cubic')),
    holdTail(1.5),
]);
