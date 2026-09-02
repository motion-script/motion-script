import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `width={'fill'} height={'fill'}` is bounded by the constraints handed down
 * from its ancestor, not an intrinsic size of its own. Here a fixed-size
 * frame shrinks; its `'fill'` child has no choice but to shrink with it,
 * since `'fill'` can never exceed the max width/height the parent passes
 * down.
 */
const frame = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect ref={frame} width={780} height={420} fill={'card'} cornerRadius={16} padding={16} center={() => stage.canvas.center}>
            <Rect width={'fill'} height={'fill'} fill={'primary'} cornerRadius={10} />
        </Rect>,
    );
}, [
    () => frame().to({ width: 260, height: 180 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
