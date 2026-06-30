import { createScene, Video, wait } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Video}'s `speed` multiplier set to `2` — the clip's picture (and audio, if unmuted) advances at double rate, covering twice the source timeline in the same wall-clock duration. */
export default createScene(function* (stage) {
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
            center={() => stage.root.center}
        />,
    );

    yield* wait(1.8);
    yield* holdTail(1.8);
});
