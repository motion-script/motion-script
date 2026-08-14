import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `align: 'outside'` (+1) keeps the whole stroke band outside the shape's measured bounds, so the inner fill area (350x350) never changes — only the outer silhouette grows. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={350}
                height={350}
                fill={'card'}
                stroke={{ weight: 4, fill: 'primary', align: 'outside' }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 48, fill: 'primary', align: 'outside' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
