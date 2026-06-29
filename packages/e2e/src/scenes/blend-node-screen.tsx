/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** Node-level `blend`: a magenta circle isolates and blends against a cyan backdrop via `'screen'`, lightening the overlap. */
export default createScene(function* (stage) {
    stage.set({ fill: '#0d0f15' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={300}
                height={300}
                cornerRadius={150}
                fill={'#8b1f5f'}
                center={{ x: 60, y: 0 }}
                blend={'normal'}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().to({ blend: 'screen' }, 0.9, undefined);
    yield* holdTail(1.2);
});
