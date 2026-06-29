/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, linear } from '@motion-script/core';
import { holdTail } from './_lib';

/** Marching-ants: a dashed stroke with an animated dashOffset. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={16}
                fill={'card'}
                stroke={{ weight: 6, fill: 'primary', dash: [24, 16], dashOffset: 0 }}
            />
        </Rect>,
    );

    // One full dash period (24 + 16 = 40) so first and last frames line up.
    yield* rect().to({ stroke: { weight: 6, fill: 'primary', dash: [24, 16], dashOffset: 40 } }, 1.5, linear());
    yield* holdTail(1.5);
});
