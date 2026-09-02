import { createRef, Rect, Fills } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Fill-level `blend`: a magenta circle's *fill* (not the node) blends against the cyan card beneath it via `'screen'`, while the node itself stays un-isolated. */
const circle = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: '#0d0f15' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={300}
                height={300}
                cornerRadius={150}
                fill={Fills.color('#8b1f5f', { blend: 'normal' })}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );
}, [
    0.3,
    () => circle().to({ fill: Fills.color('#8b1f5f', { blend: 'screen' }) }, 0.9, undefined),
    holdTail(1.2),
]);
