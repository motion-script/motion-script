import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** `dash: n` — a single number becomes `[n, n]`, an even dash/gap pattern, growing from fine to coarse. */
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
                stroke={{ weight: 6, fill: 'primary', dash: 4 }}
            />
        </Rect>,
    );
}, [
    () => rect().strokeTo({ weight: 6, fill: 'primary', dash: 28 }, 1.4, { ease: easeInOut('quad') }),
    holdTail(1.4),
]);
