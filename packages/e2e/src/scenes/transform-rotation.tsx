/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, linear } from '@motion-script/core';
import { holdTail } from './_lib';

/** A shape spinning a full rotation around its center. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={220} height={220} cornerRadius={24} fill={'accent'} rotation={0} />
        </Rect>,
    );

    yield* rect().to({ rotation: 360 }, 1.8, linear());
    yield* holdTail(1.8);
});
