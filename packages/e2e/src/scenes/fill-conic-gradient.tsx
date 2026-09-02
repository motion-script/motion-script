import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Fills.conicGradient}: a color wheel sweeping its `startAngle` around the center. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={160}
                fill={Fills.conicGradient(['#6990dd', '#e8617c', '#f2c94c', '#6990dd'], { startAngle: 0 })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.conicGradient(['#6990dd', '#e8617c', '#f2c94c', '#6990dd'], { startAngle: 360 }) }, 1.6, easeInOut('quad')),
    holdTail(1.6),
]);
