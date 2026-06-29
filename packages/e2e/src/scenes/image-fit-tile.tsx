/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `fit: 'tile'` — the image repeats at a fixed size (here scaled down via
 * `scaling`) to pave the box. We grow the box from small to large so more and
 * more tiles march into view — the box revealing additional repeats is the
 * tiling behaviour made visible.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const box = createRef<Rect>();
    stage.add(
        <Rect
            ref={box}
            width={200}
            height={200}
            cornerRadius={20}
            fill={Fills.image('kingfisher.jpg', { fit: 'tile', scaling: 0.16 })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );

    yield* box().to({ width: 720, height: 440 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
