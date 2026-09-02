import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { Latex } from '@/components/latex';
import { holdTail } from './_lib';

/** Latex `fill` as a linear gradient, sweeping its angle across the formula. */
const formula = createRef<Latex>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex
                ref={formula}
                latex={'a^2 + b^2 = c^2'}
                fontSize={96}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'])}
                rotation={0}
            />
        </Rect>,
    );
}, [
    () => formula().to({ rotation: 360 }, 1.6, easeInOut('quad')),
    holdTail(1.6),
]);
