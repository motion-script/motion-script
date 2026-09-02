import { createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Adjustments.blur}: an image fill's own pixel filter, blurring the image itself (not the node) from sharp to soft. */
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
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.blur(0) })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.blur(16) }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
