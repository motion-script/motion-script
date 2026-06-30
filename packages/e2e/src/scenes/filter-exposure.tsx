import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ImageFilters.exposure}: an image fill brightens, sweeping from a dim underexposed look to a blown-out highlight. */
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
                fill={Fills.image('kingfisher.jpg', { fit: 'fill', filters: ImageFilters.exposure(0.3) })}
            />
        </Rect>,
    );

    yield* rect().to({ fill: Fills.image('kingfisher.jpg', { fit: 'fill', filters: ImageFilters.exposure(2.5) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
