import { createScene, createRef, Row, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * {@link Row.align}: three uneven-height children packed against the top of a
 * tall container, then `align` animates to the bottom — repositioning every
 * child along the cross axis without changing the row's own gap or order.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const row = createRef<Row>();
    stage.add(
        <Row ref={row} width={700} height={420} fill={'card'} cornerRadius={16} gap={24} align={'topCenter'} center={() => stage.root.center}>
            <Rect width={100} height={100} fill={'primary'} cornerRadius={12} />
            <Rect width={100} height={220} fill={'accent'} cornerRadius={12} />
            <Rect width={100} height={150} fill={'primary'} cornerRadius={12} />
        </Row>,
    );

    yield* row().to({ align: 'bottomCenter' }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
