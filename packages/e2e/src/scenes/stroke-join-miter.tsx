import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `join: 'miter'` (the default): corners come to a sharp point, growing more prominent as the stroke thickens. */
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
                stroke={{ weight: 10, fill: 'primary', join: 'miter' }}
            />
        </Rect>,
    );
}, [
    () => rect().strokeTo({ weight: 70, fill: 'primary', join: 'miter' }, 1.4, { ease: easeInOut('quad') }),
    holdTail(1.4),
]);
