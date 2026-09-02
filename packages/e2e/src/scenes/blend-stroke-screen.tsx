import { createRef, Rect, Fills } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Stroke-level `blend`: a thick circle outline's stroke *fill* blends against the card beneath it via `'screen'`, lightening where the stroke overlaps the backdrop. */
const circle = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: '#0d0f15' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={260}
                height={260}
                cornerRadius={130}
                stroke={{ weight: 36, align: 'center', fill: Fills.color('#8b1f5f', { blend: 'normal' }) }}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );
}, [
    0.3,
    () => circle().strokeTo({ fill: Fills.color('#8b1f5f', { blend: 'screen' }) }, 0.9, {}),
    holdTail(1.2),
]);
