import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Fills.video}: a playing video clip used as a shape's fill, growing into frame. */
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
                scale={0.6}
                fill={Fills.video('video.mp4', { fit: 'fill' })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ scale: 1 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
