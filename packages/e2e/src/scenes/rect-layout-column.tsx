import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect} `flow={'vertical'}`: three children laid top-to-bottom, with the gap animating wider. */
const column = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={column} width={220} height={420} flow={'vertical'} gap={8} center={() => stage.canvas.center}>
            <Rect width={'fill'} height={100} fill={'primary'} cornerRadius={12} />
            <Rect width={'fill'} height={100} fill={'accent'} cornerRadius={12} />
            <Rect width={'fill'} height={100} fill={'primary'} cornerRadius={12} />
        </Rect>,
    );
}, [
    () => column().to({ gap: 32 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
