import { createRef, Row, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * {@link Row.align}: three uneven-height children packed against the top of a
 * tall container, then `align` animates to the bottom — repositioning every
 * child along the cross axis without changing the row's own gap or order.
 */
const row = createRef<Row>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Row ref={row} width={700} height={420} fill={'card'} cornerRadius={16} gap={24} align={'topCenter'} center={() => stage.canvas.center}>
            <Rect width={100} height={100} fill={'primary'} cornerRadius={12} />
            <Rect width={100} height={220} fill={'accent'} cornerRadius={12} />
            <Rect width={100} height={150} fill={'primary'} cornerRadius={12} />
        </Row>,
    );
}, [
    () => row().to({ align: 'bottomCenter' }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
