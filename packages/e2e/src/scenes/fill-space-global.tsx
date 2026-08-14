import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `space: 'global'`: the gradient is anchored to the render viewport, so
 * moving the node anywhere on screen changes which slice of the gradient it
 * shows through — the fill stays fixed to the frame, not the shape.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={200}
                height={200}
                cornerRadius={20}
                x={-260}
                fill={Fills.linearGradient(['#6990dd', '#e8617c'], { space: 'global' })}
            />
        </Rect>,
    );

    yield* rect().to({ x: 260 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
