import { createScene, createRef, Polygon, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Polygon}'s `start`/`end` trim props (0..1) sweeping a stroked hexagon's outline from a single point into a complete loop. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const hex = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={hex}
            sides={6}
            width={280}
            height={280}
            stroke={{ weight: 14, cap: 'round', join: 'round', fill: 'primary' }}
            start={0}
            end={0}
            center={() => stage.root.center}
        />,
    );

    yield* hex().to({ end: 1 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
