import { createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.exposure}: a playing video brightens, sweeping from dim to blown-out. */
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
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.exposure(0.3) })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.exposure(2.5) }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
