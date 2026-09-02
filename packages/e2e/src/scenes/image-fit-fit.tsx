import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `fit: 'fit'` — the image scales uniformly to be fully *contained*,
 * letterboxing as needed so the whole frame is always visible. We animate the
 * box from wide to tall so the letterbox bars visibly swing from top/bottom to
 * left/right while the bird stays entirely in view (the contain behaviour).
 */
const box = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

    stage.add(
        <Rect
            ref={box}
            width={600}
            height={300}
            cornerRadius={20}
            fill={Fills.color('card').image('kingfisher.jpg', { fit: 'fit' })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );
}, [
    () => box().to({ width: 300, height: 460 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
