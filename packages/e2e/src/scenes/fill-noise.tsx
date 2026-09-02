import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Fills.noise}: grain density ramping from sparse to dense. */
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
                fill={Fills.noise({ color: '#f4f6ff', density: 0.05 })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.noise({ color: '#f4f6ff', density: 1 }) }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
