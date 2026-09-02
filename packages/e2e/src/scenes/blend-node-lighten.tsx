import { createRef, Rect } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Node2D-level `blend`: a magenta circle isolates and blends against a cyan backdrop via `'lighten'`, keeping the lighter of each channel pair. */
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
                fill={'#8b1f5f'}
                center={{ x: 60, y: 0 }}
                blend={'normal'}
            />
        </Rect>,
    );
}, [
    0.3,
    () => circle().to({ blend: 'lighten' }, 0.9, undefined),
    holdTail(1.2),
]);
