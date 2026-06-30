import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ImageFilters.alpha}: an image fill's opacity filter fading the image out from fully opaque to nearly transparent. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    const image = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} group={'stack'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={280}
                height={280}
                cornerRadius={24}
                fill={'card'}
            >
                <Rect
                    ref={image}
                    width={'fill'}
                    height={'fill'}
                    cornerRadius={24}
                    fill={Fills.image('cat.jpg', { fit: 'fill', filters: ImageFilters.alpha(1) })}
                />
            </Rect>
        </Rect>,
    );

    yield* image().to({ fill: Fills.image('cat.jpg', { fit: 'fill', filters: ImageFilters.alpha(0.1) }) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
