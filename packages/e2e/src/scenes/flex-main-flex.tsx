import { createScene, createRef, Row, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Per-child `flex` weight along the main axis: the middle child starts at
 * weight 1 (sharing space evenly with its fixed-weight siblings) and grows to
 * weight 4, eating most of the row's width while the others shrink to match.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const middle = createRef<Rect>();
    stage.add(
        <Row width={760} height={200} gap={16} center={() => stage.canvas.center}>
            <Rect flex={1} height={'fill'} fill={'primary'} cornerRadius={12} />
            <Rect ref={middle} flex={1} height={'fill'} fill={'accent'} cornerRadius={12} />
            <Rect flex={1} height={'fill'} fill={'primary'} cornerRadius={12} />
        </Row>,
    );

    yield* middle().to({ flex: 4 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
