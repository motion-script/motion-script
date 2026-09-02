import { createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];

// Swaps the red and blue channels (Skia 4x5 row-major: rows are [R,G,B,A,bias]).
const CHANNEL_SWAP = [
    0, 0, 1, 0, 0,
    0, 1, 0, 0, 0,
    1, 0, 0, 0, 0,
    0, 0, 0, 1, 0,
];

/** {@link Adjustments.colorMatrix}: an arbitrary 4x5 Skia color matrix morphing from identity into a red/blue channel swap. */
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
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.colorMatrix(IDENTITY) })}
            />
        </Rect>,
    );
}, [
    () => rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.colorMatrix(CHANNEL_SWAP) }) }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
