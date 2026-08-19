import { createScene, createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.colorAdjustment}: a full color-grade sweep (contrast, saturation, temperature, vignette) applied live to a playing video. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.video('video.mp4', {
                    fit: 'fill',
                    filters: VideoAdjustments.colorAdjustment({ contrast: 1, saturation: 1, temperature: 0, vignette: 0 }),
                })}
            />
        </Rect>,
    );

    yield* rect().to(
        {
            fill: Fills.video('video.mp4', {
                fit: 'fill',
                filters: VideoAdjustments.colorAdjustment({ contrast: 1.6, saturation: 1.8, temperature: 0.4, vignette: 0.6 }),
            }),
        },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
