import { createRef, NumberNode, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'percent'}`: a completion percentage counting up to 87%. */
const percent = createRef<NumberNode>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <NumberNode
            ref={percent}
            value={0}
            format={'percent'}
            decimals={0}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={72}
            fill={'primary'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => percent().countTo(0.87, 1.5, easeOut('cubic')),
    holdTail(1.5),
]);
