/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `fit: 'fit'` — the image scales uniformly to be fully *contained*,
 * letterboxing as needed so the whole frame is always visible. We animate the
 * box from wide to tall so the letterbox bars visibly swing from top/bottom to
 * left/right while the bird stays entirely in view (the contain behaviour).
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const box = createRef<Rect>();
    stage.add(
        <Rect
            ref={box}
            width={600}
            height={300}
            cornerRadius={20}
            fill={Fills.color('card').image('kingfisher.jpg', { fit: 'fit' })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );

    yield* box().to({ width: 300, height: 460 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
