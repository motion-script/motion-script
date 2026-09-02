import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Negative `shadow.spread` shrinks the shadow's silhouette before it is offset and blurred, pulling it inward from the shape's edge. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={300}
                height={200}
                cornerRadius={20}
                fill={'#f4f6ff'}
                shadow={{ blur: 24, offset: { x: 0, y: 0 }, fill: '#000000', spread: 0 }}
            />
        </Rect>,
    );
}, [
    () => card().to({ shadow: { blur: 24, offset: { x: 0, y: 0 }, fill: '#000000', spread: -60 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
