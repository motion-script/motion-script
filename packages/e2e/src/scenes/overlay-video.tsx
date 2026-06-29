/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link Rect.overlay}: a playing video washes over an entire subtree of child rects, sitting above them but under the stroke. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={400}
                height={260}
                cornerRadius={20}
                fill={'card'}
                stroke={{ weight: 4, fill: 'primary' }}
                overlay={Fills.video('video.mp4', { fit: 'fill', opacity: 0 })}
                group={'row'}
                gap={16}
                padding={20}
                align={{ x: 0, y: 0 }}
            >
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#e8617c'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#f2c94c'} />
                <Rect width={'fill'} height={'fill'} cornerRadius={12} fill={'#6990dd'} />
            </Rect>
        </Rect>,
    );

    yield* card().overlayTo(Fills.video('video.mp4', { fit: 'fill', opacity: 0.7 }), 1, { ease: easeInOut('quad') });
    yield* holdTail(1);
});
