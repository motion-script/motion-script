import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * `fit: 'fill'` — the image scales uniformly to *cover* the box, cropping the
 * overflow and staying centered (no distortion, no letterboxing). We animate the
 * box from a tall portrait to a wide landscape so the crop visibly slides from
 * showing the bird's full height to cropping top/bottom — the cover behaviour.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const box = createRef<Rect>();
    stage.add(
        <Rect
            ref={box}
            width={260}
            height={440}
            cornerRadius={20}
            fill={Fills.image('kingfisher.jpg', { fit: 'fill' })}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );

    yield* box().to({ width: 620, height: 320 }, 1.4, easeInOut('cubic'));
    yield* holdTail(1.4);
});
