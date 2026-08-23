import { createScene, createRef, Rect, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Node2D-level `opacity`: the whole node — fill, stroke, and children together — fades as one unit. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const card = createRef<Rect>();
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={'primary'}
            stroke={{ weight: 6, fill: '#f4f6ff' }}
            opacity={1}
            center={() => stage.root.center}
        />,
    );

    yield* card().to({ opacity: 0.1 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
