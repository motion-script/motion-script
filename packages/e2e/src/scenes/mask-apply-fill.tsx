import { createRef, MaskGroup, Ellipse, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link MaskGroup} clipping a card's combined fill and stroke down to a growing circular window. */
const mask = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <MaskGroup mode={'vector'} width={'fill'} height={'fill'}>
            <Ellipse ref={mask} width={100} height={100} fill={'#ffffff'} />
            <Rect width={360} height={240} cornerRadius={20} fill={'primary'} stroke={{ weight: 10, align: 'inside', fill: '#f4f6ff' }} />
        </MaskGroup>,
    );
}, [
    () => mask().to({ width: 320, height: 320 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
