import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect} `flow={'horizontal'}`: three children laid left-to-right, with the gap animating wider. */
const row = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={row} width={700} height={220} flow={'horizontal'} gap={8} center={() => stage.canvas.center}>
            <Rect width={140} height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect width={140} height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect width={140} height={'fill'} fill={'primary'} cornerRadius={12} />
        </Rect>,
    );
}, [
    () => row().to({ gap: 48 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
