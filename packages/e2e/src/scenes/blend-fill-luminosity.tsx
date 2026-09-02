import { createRef, Rect, Fills } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Fill-level `blend`: a bright circle's *fill* (not the node) blends against the colorful card beneath it via `'luminosity'`, taking the circle's luminosity while keeping the card's hue and saturation. */
const circle = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect width={360} height={360} fill={'#28d6c8'} center={{ x: -60, y: 0 }} />
            <Rect
                ref={circle}
                width={300}
                height={300}
                cornerRadius={150}
                fill={Fills.color('#f4f6ff', { blend: 'normal' })}
                center={{ x: 60, y: 0 }}
            />
        </Rect>,
    );
}, [
    0.3,
    () => circle().to({ fill: Fills.color('#f4f6ff', { blend: 'luminosity' }) }, 0.9, undefined),
    holdTail(1.2),
]);
