import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { Latex } from '@/components/latex';
import { holdTail } from './_lib';

/** Latex `stroke`: an outlined-only formula (transparent fill) thickening its stroke weight. */
const formula = createRef<Latex>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex
                ref={formula}
                latex={'\\Sigma'}
                fontSize={160}
                fill={'transparent'}
                stroke={{ weight: 1, fill: 'accent' }}
            />
        </Rect>,
    );
}, [
    () => formula().strokeTo({ weight: 5, fill: 'accent' }, 1.4, { ease: easeInOut('quad') }),
    holdTail(1.4),
]);
