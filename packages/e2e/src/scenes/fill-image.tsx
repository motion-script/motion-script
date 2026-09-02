import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Fills.image}: an image fill layer scaling up inside a rounded frame. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={280}
                height={280}
                cornerRadius={24}
                scale={0.7}
                fill={Fills.image('cat.jpg', { fit: 'fill' })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ scale: 1 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
