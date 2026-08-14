import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ImageFilters.curves} stacked per-channel: separate R, G, and B tone curves layered on one image fill, each animating independently to push a teal-and-orange grade. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.image('kingfisher.jpg', {
                    fit: 'fill',
                    filters: ImageFilters.curves({ points: [[0, 0], [1, 1]], channel: 'r' })
                        .curves({ points: [[0, 0], [1, 1]], channel: 'g' })
                        .curves({ points: [[0, 0], [1, 1]], channel: 'b' }),
                })}
            />
        </Rect>,
    );

    yield* rect().to(
        {
            fill: Fills.image('kingfisher.jpg', {
                fit: 'fill',
                filters: ImageFilters.curves({ points: [[0, 0.15], [1, 1]], channel: 'r' })
                    .curves({ points: [[0, 0], [1, 1]], channel: 'g' })
                    .curves({ points: [[0, 0], [1, 0.7]], channel: 'b' }),
            }),
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
