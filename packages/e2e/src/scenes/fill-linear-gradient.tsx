/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A rect with a linear gradient fill, rotating the whole shape to sweep the gradient angle. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={20}
                rotation={0}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'])}
            />
        </Rect>,
    );

    yield* rect().to({ rotation: 90 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
