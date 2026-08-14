import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `align: 'center'` (0) straddles the shape's edge — half the weight sits inside, half outside, so the silhouette grows on both sides as the stroke thickens. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={300}
                height={300}
                fill={'card'}
                stroke={{ weight: 4, fill: 'primary', align: 'center' }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 48, fill: 'primary', align: 'center' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
