import { createScene, createRef, Rect, easeOut, wait } from 'motion-script';
import { holdTail } from './_lib';

/** {@link easeOut}`('elastic')`: a card springs to its target, oscillating like a rubber band before settling. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={120} height={120} cornerRadius={16} fill={'primary'} center={{ x: -300, y: 0 }} />,
    );

    yield* card().to({ x: 300 }, 1.4, easeOut('elastic'));
    yield* wait(0.2);
    yield* holdTail(1.6);
});
