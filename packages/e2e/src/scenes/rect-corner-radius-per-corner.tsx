import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Rect animating an asymmetric, per-corner radius: only the top-left and
 * bottom-right corners round, while the other two stay sharp — exercising the
 * `{ topLeft, topRight, bottomLeft, bottomRight }` corner-radius input form.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
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

    yield* rect().to(
        { cornerRadius: { topLeft: 120, topRight: 0, bottomLeft: 0, bottomRight: 120 } },
        1.3,
        easeInOut('quad'),
    );
    yield* holdTail(1.3);
});
