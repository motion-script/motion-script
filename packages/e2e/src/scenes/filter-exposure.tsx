import { createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Adjustments.exposure}: an image fill brightens, sweeping from a dim underexposed look to a blown-out highlight. */
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
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.exposure(0.3) })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.exposure(2.5) }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
