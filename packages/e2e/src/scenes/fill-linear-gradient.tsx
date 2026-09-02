import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A rect with a linear gradient fill, rotating the whole shape to sweep the gradient angle. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={360}
                height={240}
                cornerRadius={20}
                rotation={0}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'])}
            />
        </Rect>,
    );
}, [
    () => rect().to({ rotation: 90 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
