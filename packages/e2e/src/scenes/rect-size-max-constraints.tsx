import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `width={'fill'} height={'fill'}` is bounded by the constraints handed down
 * from its ancestor, not an intrinsic size of its own. Here a fixed-size
 * frame shrinks; its `'fill'` child has no choice but to shrink with it,
 * since `'fill'` can never exceed the max width/height the parent passes
 * down.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const frame = createRef<Rect>();
    stage.add(
        <Rect ref={frame} width={780} height={420} fill={'card'} cornerRadius={16} padding={16} center={() => stage.root.center}>
            <Rect width={'fill'} height={'fill'} fill={'primary'} cornerRadius={10} />
        </Rect>,
    );

    yield* frame().to({ width: 260, height: 180 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
