import { createScene, createRef, Rect, Fills, VideoFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link VideoFilters.echo}: a motion-trail effect compositing the current video frame with several delayed, decaying past frames, growing from a single tap to a long trail. */
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
                fill={Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.echo({ echoes: 1, delay: 0.05, decay: 0.5 }) })}
            />
        </Rect>,
    );

    yield* rect().to(
        { fill: Fills.video('video.mp4', { fit: 'fill', filters: VideoFilters.echo({ echoes: 8, delay: 0.05, decay: 0.7 }) }) },
        1.4,
        easeInOut('quad'),
    );
    yield* holdTail(1.4);
});
