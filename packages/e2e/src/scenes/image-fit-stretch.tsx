/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/**
 * `fit: 'stretch'` — each axis is scaled independently so the image always fills
 * the box exactly, distorting the aspect ratio. We animate the box from tall to
 * wide: the bird visibly squashes vertically then stretches horizontally,
 * making the per-axis distortion the obvious feature.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const box = createRef<Rect>();
    stage.add(
        <Rect
            ref={box}
            width={240}
            height={460}
            cornerRadius={20}
            fill={Fills.image('kingfisher.jpg', { fit: 'stretch' })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );

    yield* box().to({ width: 680, height: 280 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
