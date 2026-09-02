import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Independent horizontal/vertical scale (as opposed to uniform `scale`): a card stretches wide and flattens by tweening `width`/`height` independently, then squeezes narrow and tall. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={160} height={160} cornerRadius={20} fill={'primary'} center={() => stage.canvas.center} />,
    );
}, [
    () => card().to({ width: 288, height: 80 }, 0.8, easeInOut('quad')),
    () => card().to({ width: 80, height: 288 }, 0.8, easeInOut('quad')),
    holdTail(1.6),
]);
