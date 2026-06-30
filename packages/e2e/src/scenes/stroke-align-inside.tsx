import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `align: 'inside'` (-1) keeps the whole stroke band within the shape's
 * measured bounds, like a CSS border. We grow the weight so the band thickens
 * *inward* from the edge — the outer silhouette (350x350) never changes.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={350}
                height={350}
                fill={'card'}
                stroke={{ weight: 4, fill: 'primary', align: 'inside' }}
            />
        </Rect>,
    );

    // Thicken the inside band: outer edge holds, fill area shrinks inward.
    yield* rect().strokeTo({ weight: 48, fill: 'primary', align: 'inside' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
