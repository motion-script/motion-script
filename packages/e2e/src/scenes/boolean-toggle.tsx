import { createScene, createRef, BooleanGroup, Rect, Ellipse, wait } from 'motion-script';
import { holdTail } from './_lib';

/** {@link BooleanGroup}'s `op` toggling between `'union'` and `'subtract'` at the midpoint — the combined silhouette of a rect and an overlapping circle switches from a merged blob to a rect with a circular bite taken out. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const group = createRef<BooleanGroup>();
    stage.add(
        <BooleanGroup ref={group} op={'union'} fill={'primary'} center={() => stage.root.center}>
            <Rect width={280} height={200} cornerRadius={20} center={{ x: -40, y: 0 }} />
            <Ellipse width={200} height={200} center={{ x: 80, y: 0 }} />
        </BooleanGroup>,
    );

    yield* wait(0.5);
    group().op = 'subtract';
    yield* wait(0.8);
    group().op = 'union';
    yield* holdTail(1.3);
});
