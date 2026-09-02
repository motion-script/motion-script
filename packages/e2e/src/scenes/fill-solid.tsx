import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A plain CSS color string as `fill` is shorthand for a solid fill; it tweens like any other color. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={300} height={300} cornerRadius={24} fill={'#6990dd'} />
        </Rect>,
    );
}, [
    () => rect().to({ fill: '#e8617c' }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
