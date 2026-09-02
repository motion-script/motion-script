import { createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.grayscale}: a playing video desaturates as `amount` ramps from 0 to 1. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.grayscale(0) })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.grayscale(1) }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
