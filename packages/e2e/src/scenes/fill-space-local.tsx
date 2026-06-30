import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `space: 'local'` (the default): the gradient is pinned to the shape's own
 * bounds, so moving the node around does not change its appearance — the
 * gradient rides along with it.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={200}
                height={200}
                cornerRadius={20}
                x={-260}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'], { space: 'local' })}
            />
        </Rect>,
    );

    yield* rect().to({ x: 260 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
