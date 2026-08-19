import { createScene, createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.exposure}: a playing video brightens, sweeping from dim to blown-out. */
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
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.exposure(0.3) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.exposure(2.5) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
