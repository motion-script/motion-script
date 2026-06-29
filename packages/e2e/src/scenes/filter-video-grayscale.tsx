/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, VideoFilters, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link VideoFilters.grayscale}: a playing video desaturates as `amount` ramps from 0 to 1. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.grayscale(0) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.grayscale(1) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
