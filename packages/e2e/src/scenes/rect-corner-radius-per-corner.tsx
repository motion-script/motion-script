import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Rect animating an asymmetric, per-corner radius: only the top-left and
 * bottom-right corners round, while the other two stay sharp — exercising the
 * `{ topLeft, topRight, bottomLeft, bottomRight }` corner-radius input form.
 */
const rect = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={300}
                height={300}
                fill={'primary'}
                cornerRadius={{ topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }}
            />
        </Rect>,
    );
}, [
    () => rect().to(
        { cornerRadius: { topLeft: 120, topRight: 0, bottomLeft: 0, bottomRight: 120 } },
        1.3,
        easeInOut('quad'),
    ),
    holdTail(1.3),
]);
