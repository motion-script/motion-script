import { Video } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Video}'s `speed` multiplier set to `2` — the clip's picture (and audio, if unmuted) advances at double rate, covering twice the source timeline in the same wall-clock duration. */
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Video
            src={'video.mp4'}
            width={480}
            height={270}
            fit={'fill'}
            trimStart={0}
            speed={2}
            muted={true}
            center={() => stage.canvas.center}
        />,
    );
}, [
    1.8,
    holdTail(1.8),
]);
