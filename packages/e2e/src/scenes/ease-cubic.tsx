import { createScene, createRef, Rect, easeInOut, wait } from 'motion-script';
import { holdTail } from './_lib';

/** {@link easeInOut}`('cubic')`: a card slides across with a moderate, balanced acceleration/deceleration curve. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={120} height={120} cornerRadius={16} fill={'primary'} center={{ x: -300, y: 0 }} />,
    );

    yield* card().to({ x: 300 }, 1.2, easeInOut('cubic'));
    yield* wait(0.2);
    yield* holdTail(1.4);
});
