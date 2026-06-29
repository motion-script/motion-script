/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** Stroke-level `blend`: a thick circle outline's stroke *fill* blends against the card beneath it via `'screen'`, lightening where the stroke overlaps the backdrop. */
export default createScene(function* (stage) {
    stage.set({ fill: '#0d0f15' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={260}
                height={260}
                cornerRadius={130}
                stroke={{ weight: 36, align: 'center', fill: Fills.color('#8b1f5f', { blend: 'normal' }) }}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().strokeTo({ fill: Fills.color('#8b1f5f', { blend: 'screen' }) }, 0.9, {});
    yield* holdTail(1.2);
});
