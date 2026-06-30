import { createScene, createRef, Rect, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Stroke-level `opacity`: only the stroke fades, leaving the fill fully opaque throughout. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={'card'}
            stroke={{ weight: 10, align: 'center', fill: Fills.color('primary', { opacity: 1 }) }}
            center={() => stage.root.center}
        />,
    );

    yield* card().strokeTo({ fill: Fills.color('primary', { opacity: 0.1 }) }, 1.2, { ease: easeInOut('quad') });
    yield* holdTail(1.2);
});
