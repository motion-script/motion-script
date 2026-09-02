import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `join: 'bevel'`: corners are flattened into a short straight cut instead of a sharp point, more visible as the stroke thickens. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={260}
                height={260}
                fill={'card'}
                stroke={{ weight: 10, fill: 'primary', join: 'bevel' }}
            />
        </Rect>,
    );
}, [
    () => rect().strokeTo({ weight: 70, fill: 'primary', join: 'bevel' }, 1.4, { ease: easeInOut('quad') }),
    holdTail(1.4),
]);
