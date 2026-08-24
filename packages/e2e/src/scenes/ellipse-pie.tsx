import { createScene, createRef, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Ellipse pie slice: a filled wedge with `sweep` opening from a sliver to a near-full circle. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const pie = createRef<Ellipse>();
    stage.add(
        <Ellipse
            ref={pie}
            width={300}
            height={300}
            startAngle={-90}
            sweep={20}
            fill={'accent'}
            stroke={{ weight: 3, fill: 'bg' }}
            center={() => stage.canvas.center}
        />,
    );

    yield* pie().to({ sweep: 320 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
