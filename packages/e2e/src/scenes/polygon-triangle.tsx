import { createScene, createRef, Polygon, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** An equilateral triangle (`sides={3}`) spinning into view. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const triangle = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={triangle}
            width={300}
            height={300}
            sides={3}
            fill={'primary'}
            rotation={-90}
            scale={0.6}
            center={() => stage.root.center}
        />,
    );

    yield* triangle().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back'));
    yield* holdTail(1.3);
});
