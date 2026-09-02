import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `fit: 'tile'` — the image repeats at a fixed size (here scaled down via
 * `zoom`) to pave the box. We grow the box from small to large so more and
 * more tiles march into view — the box revealing additional repeats is the
 * tiling behaviour made visible.
 */
const box = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

    stage.add(
        <Rect
            ref={box}
            width={200}
            height={200}
            cornerRadius={20}
            fill={Fills.image('kingfisher.jpg', { fit: 'tile', zoom: 0.16 })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );
}, [
    () => box().to({ width: 720, height: 440 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
