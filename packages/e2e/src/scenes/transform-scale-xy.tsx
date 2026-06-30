import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Independent horizontal/vertical scale (as opposed to uniform `scale`): a card stretches wide and flattens by tweening `width`/`height` independently, then squeezes narrow and tall. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect ref={card} width={160} height={160} cornerRadius={20} fill={'primary'} center={() => stage.root.center} />,
    );

    yield* card().to({ width: 288, height: 80 }, 0.8, easeInOut('quad'));
    yield* card().to({ width: 80, height: 288 }, 0.8, easeInOut('quad'));
    yield* holdTail(1.6);
});
