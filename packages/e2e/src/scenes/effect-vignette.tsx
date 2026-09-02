import { createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.vignette}: the corners of a bright card darken as `amount` ramps from 0 to 1. */
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
                fill={Fills.linearGradient(['#f4f6ff', '#9fb4e8'])}
                effects={Effects.vignette(0)}
            />
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.vignette({ amount: 1, radius: 0.4, softness: 0.7 }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
