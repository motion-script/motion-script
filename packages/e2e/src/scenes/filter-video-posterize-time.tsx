import { createScene, createRef, Rect, Fills, VideoAdjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link VideoAdjustments.posterizeTime}: snaps the video playhead to a coarser frame rate, dropping from a smooth 30fps to a choppy stop-motion 4fps. */
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
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.posterizeTime(30) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoAdjustments.posterizeTime(4) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
