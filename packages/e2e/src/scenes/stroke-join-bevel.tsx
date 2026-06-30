import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** `join: 'bevel'`: corners are flattened into a short straight cut instead of a sharp point, more visible as the stroke thickens. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={260}
                height={260}
                fill={'card'}
                stroke={{ weight: 10, fill: 'primary', join: 'bevel' }}
            />
        </Rect>,
    );

    yield* rect().strokeTo({ weight: 70, fill: 'primary', join: 'bevel' }, 1.4, { ease: easeInOut('quad') });
    yield* holdTail(1.4);
});
