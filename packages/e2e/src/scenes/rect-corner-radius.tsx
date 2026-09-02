import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Rect animating a uniform corner radius from sharp to fully rounded. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={260} height={260} fill={'primary'} cornerRadius={0} />
        </Rect>,
    );
}, [
    () => rect().to({ cornerRadius: 130 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
