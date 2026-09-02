import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect.padding} per-side: independent left/right/top/bottom insets animating to very different values, skewing the content box off-center. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect
            ref={card}
            width={500}
            height={360}
            fill={'card'}
            cornerRadius={16}
            padding={{ left: 20, right: 20, top: 20, bottom: 20 }}
            center={() => stage.canvas.center}
        >
            <Rect width={'fill'} height={'fill'} fill={'accent'} cornerRadius={8} />
        </Rect>,
    );
}, [
    () => card().to({ padding: { left: 16, right: 120, top: 100, bottom: 16 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
