import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect.gap}: spacing between row children animating from tight to wide. */
const row = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={row} width={'fill'} height={200} flow={'horizontal'} align={{ x: 0, y: 0 }} gap={0} center={() => stage.canvas.center}>
            <Rect width={120} height={120} fill={'primary'} cornerRadius={16} />
            <Rect width={120} height={120} fill={'accent'} cornerRadius={16} />
            <Rect width={120} height={120} fill={'primary'} cornerRadius={16} />
        </Rect>,
    );
}, [
    () => row().to({ gap: 60 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
