import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `space: 'parent'`: the gradient maps onto the parent's layout rect, so
 * sliding the node *within* its parent changes which slice of the gradient it
 * shows — unlike `space: 'local'`, the fill does not follow the shape.
 */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    const parent = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect ref={parent} width={640} height={200} flow={'freeform'} align={{ x: -1, y: 0 }}>
                <Rect
                    ref={rect}
                    width={200}
                    height={200}
                    cornerRadius={20}
                    fill={Fills.linearGradient(['#6990dd', '#e8617c'], { space: 'parent' })}
                />
            </Rect>
        </Rect>,
    );
}, [
    () => rect().to({ align: { x: 1, y: 0 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
