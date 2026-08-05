import { createScene, createRef, Image, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `crop` — a window onto the source, in fractions of its own size, applied
 * *before* `fit`. The box never changes; only the slice of the bird being shown
 * does, opening from a tight centre crop out to the whole frame. Because the
 * cover scale is recomputed against the cropped window, the picture stays
 * edge-to-edge throughout — a crop composes with `fit` rather than fighting it.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const photo = createRef<Image>();
    stage.add(
        <Image
            ref={photo}
            src="kingfisher.jpg"
            width={520}
            height={380}
            cornerRadius={20}
            crop={{ horizontal: 0.3, vertical: 0.2 }}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );

    yield* photo().to({ crop: 0 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
