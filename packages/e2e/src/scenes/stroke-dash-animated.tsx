import { createRef, Rect, linear } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Marching-ants: a dashed stroke with an animated dashOffset. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={16}
                fill={'card'}
                stroke={{ weight: 6, fill: 'primary', dash: [24, 16], dashOffset: 0 }}
            />
        </Rect>,
    );
}, [
    // One full dash period (24 + 16 = 40) so first and last frames line up.
    () => rect().to({ stroke: { weight: 6, fill: 'primary', dash: [24, 16], dashOffset: 40 } }, 1.5, linear()),
    holdTail(1.5),
]);
