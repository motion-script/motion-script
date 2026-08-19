import { createScene, createRef, Rect, Fills, Adjustments, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Adjustments.grayscale}: an image fill's own pixel filter desaturating the image as `amount` ramps from 0 to 1. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.grayscale(0) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: Adjustments.grayscale(1) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
