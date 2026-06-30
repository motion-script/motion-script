import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ImageFilters.blur}: an image fill's own pixel filter, blurring the image itself (not the node) from sharp to soft. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: ImageFilters.blur(0) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: ImageFilters.blur(16) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
