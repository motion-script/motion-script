import { createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.halftone}: a gradient resolves into a 45-degree dot screen as the cell `size` grows. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={Fills.linearGradient(['#0d0f15', '#f4f6ff'])}
                effects={Effects.halftone(2)}
            />
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.halftone(20) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
