import { createScene, createRef, NumberNode, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'percent'}`: a completion percentage counting up to 87%. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const percent = createRef<NumberNode>();
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
            center={() => stage.root.center}
        />,
    );

    yield* percent().countTo(0.87, 1.5, easeOut('cubic'));
    yield* holdTail(1.5);
});
