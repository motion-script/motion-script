import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Fills.image}: an image fill layer scaling up inside a rounded frame. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={280}
                height={280}
                cornerRadius={24}
                scale={0.7}
                fill={Fills.image('cat.jpg', { fit: 'fill' })}
            />
        </Rect>,
    );

    yield* rect().to({ scale: 1 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
