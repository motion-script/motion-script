/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** Negative `shadow.spread` shrinks the shadow's silhouette before it is offset and blurred, pulling it inward from the shape's edge. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={300}
                height={200}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={{ blur: 24, offset: { x: 0, y: 0 }, fill: '#000000', spread: 0 }}
            />
        </Rect>,
    );

    yield* card().to({ shadow: { blur: 24, offset: { x: 0, y: 0 }, fill: '#000000', spread: -60 } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
