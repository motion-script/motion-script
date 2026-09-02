import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Drop shadow `blur` alone sharpening from a soft, wide haze down to a crisp, tight edge. */
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
                shadow={{ blur: 80, offset: { x: 0, y: 16 }, fill: '#000000' }}
            />
        </Rect>,
    );
}, [
    () => card().to({ shadow: { blur: 2, offset: { x: 0, y: 16 }, fill: '#000000' } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
