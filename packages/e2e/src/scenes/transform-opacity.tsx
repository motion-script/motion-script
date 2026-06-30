import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Position and scale transforming together with `opacity` fading in, in one combined tween — a typical "pop in while sliding" entrance. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={200} height={140} cornerRadius={20} fill={'primary'} center={{ x: 0, y: 120 }} scale={0.5} opacity={0} />,
    );

    yield* card().to({ y: 0, scale: 1, opacity: 1 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
