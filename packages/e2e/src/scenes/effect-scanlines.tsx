import { createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.scanlines}: CRT bands darken across a bright card as `darkness` ramps up. */
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
                fill={Fills.linearGradient(['#7ad9ff', '#f4f6ff'])}
                effects={Effects.scanlines({ darkness: 0, spacing: 8 })}
            />
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.scanlines({ darkness: 0.9, spacing: 8 }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
