import { createScene, createRef, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** Ellipse arc stroke: `sweep` animating from a quarter-turn to a near-full circle. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const arc = createRef<Ellipse>();
    stage.add(
        <Ellipse
            ref={arc}
            width={300}
            height={300}
            startAngle={-90}
            sweep={90}
            fill={'transparent'}
            stroke={{ weight: 16, fill: 'primary', cap: 'round' }}
            center={() => stage.root.center}
        />,
    );

    yield* arc().to({ sweep: 300 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
