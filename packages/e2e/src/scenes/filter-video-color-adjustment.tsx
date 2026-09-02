import { createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.colorAdjustment}: a full color-grade sweep (contrast, saturation, temperature, vignette) applied live to a playing video. */
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
                fill={Fills.video('video.mp4', {
                    fit: 'fill',
                    filters: VideoAdjustments.colorAdjustment({ contrast: 1, saturation: 1, temperature: 0, vignette: 0 }) })}
            />
        </Rect>,
    );
}, [
    () => rect().to(
        {
            fill: Fills.video('video.mp4', {
                fit: 'fill',
                filters: VideoAdjustments.colorAdjustment({ contrast: 1.6, saturation: 1.8, temperature: 0.4, vignette: 0.6 }) }) },
        1.4,
        easeInOut('quad'),
    ),
    holdTail(1.4),
]);
