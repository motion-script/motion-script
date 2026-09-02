import { createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Adjustments.curves}: a linear (no-op) RGB tone curve bends into a high-contrast S-curve, deepening shadows and lifting highlights. */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.curves({ points: [[0, 0], [0.5, 0.5], [1, 1]] }) })}
            />
        </Rect>,
    );
}, [
    () => rect().to(
        { fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.curves({ points: [[0, 0], [0.25, 0.1], [0.75, 0.9], [1, 1]] }) }) },
        1.4,
        easeInOut('quad'),
    ),
    holdTail(1.4),
]);
