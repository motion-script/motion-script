import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `space: 'local'` (the default): the gradient is pinned to the shape's own
 * bounds, so moving the node around does not change its appearance — the
 * gradient rides along with it.
 */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={200}
                height={200}
                cornerRadius={20}
                x={-260}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'], { space: 'local' })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ x: 260 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
