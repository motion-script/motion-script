import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `align: 'outside'` (+1) keeps the whole stroke band outside the shape's measured bounds, so the inner fill area (350x350) never changes — only the outer silhouette grows. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
}, [
    () => rect().strokeTo({ weight: 48, fill: 'primary', align: 'outside' }, 1.4, { ease: easeInOut('quad') }),
    holdTail(1.4),
]);
