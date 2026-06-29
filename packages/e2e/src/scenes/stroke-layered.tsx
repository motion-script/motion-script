/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** A node's `stroke` accepts an array: a thick outer band plus a thin inner accent line, stacked bottom-to-top, both thickening together. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={300}
                height={300}
                cornerRadius={24}
                fill={'card'}
                stroke={[
                    { weight: 10, fill: 'primary', align: 'inside' },
                    { weight: 2, fill: '#f4f6ff', align: 'inside' },
                ]}
            />
        </Rect>,
    );

    yield* rect().to(
        {
            stroke: [
                { weight: 36, fill: 'primary', align: 'inside' },
                { weight: 2, fill: '#f4f6ff', align: 'inside' },
            ],
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
