/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Polygram, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `miterLimit` caps the ratio of miter length to stroke weight before a
 * `'miter'` join is truncated to a bevel. A sharp star's points exceed the
 * ratio quickly, so dropping the limit visibly flattens its tips even though
 * `join` stays `'miter'` throughout.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const star = createRef<Polygram>();
    stage.add(
        <Polygram
            ref={star}
            sides={5}
            ratio={0.4}
            width={280}
            height={280}
            fill={'card'}
            stroke={{ weight: 14, fill: 'primary', join: 'miter', miterLimit: 8 }}
            center={() => stage.root.center}
        />,
    );

    yield* star().strokeTo({ weight: 14, fill: 'primary', join: 'miter', miterLimit: 1 }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
