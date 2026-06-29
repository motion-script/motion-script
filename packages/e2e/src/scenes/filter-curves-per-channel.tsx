/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from '@motion-script/core';
import { holdTail } from './_lib';

/** {@link ImageFilters.curves} stacked per-channel: separate R, G, and B tone curves layered on one image fill, each animating independently to push a teal-and-orange grade. */
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
                fill={Fills.image('kingfisher.jpg', {
                    fit: 'fill',
                    filters: ImageFilters.curves([[0, 0], [1, 1]], 'r')
                        .curves([[0, 0], [1, 1]], 'g')
                        .curves([[0, 0], [1, 1]], 'b'),
                })}
            />
        </Rect>,
    );

    yield* rect().to(
        {
            fill: Fills.image('kingfisher.jpg', {
                fit: 'fill',
                filters: ImageFilters.curves([[0, 0.15], [1, 1]], 'r')
                    .curves([[0, 0], [1, 1]], 'g')
                    .curves([[0, 0], [1, 0.7]], 'b'),
            }),
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
