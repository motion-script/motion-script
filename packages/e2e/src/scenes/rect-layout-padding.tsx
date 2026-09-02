import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Rect.padding} (uniform): a card's inner content box shrinking inward as padding grows on every side. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={card} width={500} height={360} fill={'card'} cornerRadius={16} padding={0} center={() => stage.canvas.center}>
            <Rect width={'fill'} height={'fill'} fill={'primary'} cornerRadius={8} />
        </Rect>,
    );
}, [
    () => card().to({ padding: 70 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
