import { createRef, Rect, easeOut } from 'motion-script';
import { scene } from './_chain';
import { Latex } from '@/components/latex';
import { holdTail } from './_lib';

/** Latex node rendering a simple formula (E = mc^2), fading in. */
const formula = createRef<Latex>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex ref={formula} latex={'E = mc^2'} fontSize={96} fill={'#f4f6ff'} opacity={0} />
        </Rect>,
    );
}, [
    () => formula().to({ opacity: 1 }, 0.8, easeOut('quad')),
    holdTail(0.8),
]);
