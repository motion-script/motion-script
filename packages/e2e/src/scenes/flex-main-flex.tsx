import { createRef, Row, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Per-child `flex` weight along the main axis: the middle child starts at
 * weight 1 (sharing space evenly with its fixed-weight siblings) and grows to
 * weight 4, eating most of the row's width while the others shrink to match.
 */
const middle = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Row width={760} height={200} gap={16} center={() => stage.canvas.center}>
            <Rect flex={1} height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect ref={middle} flex={1} height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect flex={1} height={'fill'} fill={'primary'} cornerRadius={12} />
        </Row>,
    );
}, [
    () => middle().to({ flex: 4 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
