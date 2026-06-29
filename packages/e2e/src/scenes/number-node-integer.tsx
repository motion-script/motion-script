/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, NumberNode, easeOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link NumberNode} `format={'number'}` with grouping: a counter ticking up to a large integer. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const counter = createRef<NumberNode>();
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
            center={() => stage.root.center}
        />,
    );

    yield* counter().countTo(48291, 1.5, easeOut('cubic'));
    yield* holdTail(1.5);
});
