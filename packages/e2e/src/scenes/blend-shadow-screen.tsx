/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** Shadow-level `blend`: a card's drop shadow *fill* blends against the backdrop beneath it via `'screen'`, lightening the overlap. */
export default createScene(function* (stage) {
    stage.set({ fill: '#0d0f15' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: 0, y: 0 }} />
            <Rect
                ref={card}
                width={200}
                height={140}
                cornerRadius={16}
                fill={'#0d0f15'}
                center={{ x: 0, y: 0 }}
                shadow={{ offset: { x: 40, y: 40 }, blur: 30, fill: Fills.color('#8b1f5f', { blend: 'normal' }) }}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* card().to({ shadow: { offset: { x: 40, y: 40 }, blur: 30, fill: Fills.color('#8b1f5f', { blend: 'screen' }) } }, 0.9, undefined);
    yield* holdTail(1.2);
});
