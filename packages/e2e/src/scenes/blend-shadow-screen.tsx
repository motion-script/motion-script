import { createRef, Rect, Fills } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Shadow-level `blend`: a card's drop shadow *fill* blends against the backdrop beneath it via `'screen'`, lightening the overlap. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: '#0d0f15' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#1f5f8b'} center={{ x: 0, y: 0 }} />
            <Rect
                ref={card}
                width={200}
                height={140}
                cornerRadius={16}
                fill={'#0d0f15'}
                center={{ x: 0, y: 0 }}
                shadow={{ offset: { x: 40, y: 40 }, blur: 30, fill: Fills.color('#8b1f5f', { blend: 'normal' }) }}
            />
        </Rect>,
    );
}, [
    0.3,
    () => card().to({ shadow: { offset: { x: 40, y: 40 }, blur: 30, fill: Fills.color('#8b1f5f', { blend: 'screen' }) } }, 0.9, undefined),
    holdTail(1.2),
]);
