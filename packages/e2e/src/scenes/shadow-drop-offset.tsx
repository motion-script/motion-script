import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Drop shadow whose OFFSET sweeps from up-left to down-right while blur stays
 * fixed, so the moving offset is the only visible variable.
 */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={300}
                height={300}
                cornerRadius={28}
                fill={'card'}
                shadow={{ blur: 18, offset: { x: -40, y: -40 }, fill: Fills.color('#000000', { opacity: 0.7 }) }}
            />
        </Rect>,
    );
}, [
    () => card().to(
        { shadow: { blur: 18, offset: { x: 40, y: 40 }, fill: Fills.color('#000000', { opacity: 0.7 }) } },
        1.4,
        easeInOut('sine'),
    ),
    holdTail(1.4),
]);
