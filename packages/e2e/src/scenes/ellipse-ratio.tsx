import { createScene, createRef, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Ellipse `ratio` (width-to-height) animating from a tall oval to a wide one. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const ellipse = createRef<Ellipse>();
    stage.add(
        <Ellipse
            ref={ellipse}
            width={300}
            height={300}
            ratio={0.4}
            fill={'primary'}
            center={() => stage.root.center}
        />,
    );

    yield* ellipse().to({ ratio: 2.2 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
