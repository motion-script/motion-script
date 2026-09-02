import { createRef, Rect, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect} `flow={'freeform'}`: three children centered and overlapping, popping in from largest to smallest. */
const back = createRef<Rect>();
const mid = createRef<Rect>();
const front = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={back} width={360} height={360} fill={'primary'} cornerRadius={20} scale={0} />
            <Rect ref={mid} width={240} height={240} fill={'card'} cornerRadius={20} scale={0} />
            <Rect ref={front} width={120} height={120} fill={'accent'} cornerRadius={20} scale={0} />
        </Rect>,
    );
}, [
    () => back().to({ scale: 1 }, 0.5, easeOut('back')),
    () => mid().to({ scale: 1 }, 0.5, easeOut('back')),
    () => front().to({ scale: 1 }, 0.5, easeOut('back')),
    holdTail(1.5),
]);
