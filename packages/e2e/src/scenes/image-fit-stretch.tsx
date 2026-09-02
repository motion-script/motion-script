import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `fit: 'stretch'` — each axis is scaled independently so the image always fills
 * the box exactly, distorting the aspect ratio. We animate the box from tall to
 * wide: the bird visibly squashes vertically then stretches horizontally,
 * making the per-axis distortion the obvious feature.
 */
const box = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

    stage.add(
        <Rect
            ref={box}
            width={240}
            height={460}
            cornerRadius={20}
            fill={Fills.image('kingfisher.jpg', { fit: 'stretch' })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );
}, [
    () => box().to({ width: 680, height: 280 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
