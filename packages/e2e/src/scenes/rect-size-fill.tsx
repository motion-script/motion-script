import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `width={'fill'} height={'fill'}`: a child stretches to fill its padded
 * parent, then tracks the parent as it resizes — confirming `'fill'` is
 * computed relative to the live content box, not a one-time snapshot.
 */
const parent = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={parent} width={300} height={460} fill={'card'} cornerRadius={16} padding={20} center={() => stage.canvas.center}>
            <Rect width={'fill'} height={'fill'} fill={'primary'} cornerRadius={8} />
        </Rect>,
    );
}, [
    () => parent().to({ width: 700, height: 220 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
