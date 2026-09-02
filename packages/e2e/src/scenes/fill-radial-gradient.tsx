import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Fills.radialGradient}: the glow radius grows from a tight pool of light to filling the shape. */
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
                fill={Fills.radialGradient(['#f2c94c', '#23283a'], { radius: 30 })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.radialGradient(['#f2c94c', '#23283a'], { radius: 280 }) }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
