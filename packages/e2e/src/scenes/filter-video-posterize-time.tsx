import { createScene, createRef, Rect, Fills, VideoFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link VideoFilters.posterizeTime}: snaps the video playhead to a coarser frame rate, dropping from a smooth 30fps to a choppy stop-motion 4fps. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.posterizeTime(30) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.posterizeTime(4) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
