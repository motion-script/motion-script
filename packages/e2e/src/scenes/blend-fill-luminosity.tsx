/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, wait } from '@motion-script/core';
import { holdTail } from './_lib';

/** Fill-level `blend`: a bright circle's *fill* (not the node) blends against the colorful card beneath it via `'luminosity'`, taking the circle's luminosity while keeping the card's hue and saturation. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const circle = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#28d6c8'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={300}
                height={300}
                cornerRadius={150}
                fill={Fills.color('#f4f6ff', { blend: 'normal' })}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );

    yield* wait(0.3);
    yield* circle().to({ fill: Fills.color('#f4f6ff', { blend: 'luminosity' }) }, 0.9, undefined);
    yield* holdTail(1.2);
});
