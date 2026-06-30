import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Rect with fixed width/height and a solid fill, gently scaling in. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect ref={rect} width={320} height={200} fill={'primary'} scale={0.6} />
        </Rect>,
    );

    yield* rect().to({ scale: 1 }, 1, easeInOut('quad'));
    yield* holdTail(1);
});
