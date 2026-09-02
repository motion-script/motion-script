import { createRef, Rect, Fills, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.posterize}: a smooth gradient flattens into bands as `levels` drops from many levels to just a few. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={Fills.linearGradient(['#0d0f15', '#f4f6ff'])}
                effects={Effects.posterize(64)}
            />
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.posterize(3) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
