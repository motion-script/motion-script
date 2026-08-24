import { createScene, createRef, Rect, linear } from 'motion-script';
import { holdTail } from './_lib';

/** Default pivot (the node's center): rotation spins the card in place around its own midpoint. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={240} height={120} cornerRadius={16} fill={'primary'} rotation={0} center={() => stage.canvas.center} />,
    );

    yield* card().to({ rotation: 360 }, 1.6, linear());
    yield* holdTail(1.6);
});
