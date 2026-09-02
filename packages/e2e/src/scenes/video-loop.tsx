import { Video } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Video}'s `loop: 'forward'` repeating a short trimmed clip continuously, restarting from `trimStart` once it reaches `trimEnd` rather than stopping on the last frame. */
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Video
            src={'video.mp4'}
            width={480}
            height={270}
            fit={'fill'}
            trimStart={0}
            trimEnd={0.6}
            loop={'forward'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    1.8,
    holdTail(1.8),
]);
