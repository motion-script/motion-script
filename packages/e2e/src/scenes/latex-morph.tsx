import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { Latex } from '@/components/latex';
import { holdTail } from './_lib';

/** Latex `to({ latex })`: one formula morphs smoothly, token by token, into another. */
const formula = createRef<Latex>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Latex ref={formula} latex={'x^2 + y^2 = r^2'} fontSize={80} fill={'#f4f6ff'} />
        </Rect>,
    );
}, [
    () => formula().to({ latex: 'e^{i\\pi} + 1 = 0' }, 1.5, easeInOut('quad')),
    holdTail(1.5),
]);
