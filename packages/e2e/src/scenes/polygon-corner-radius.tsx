import { createScene, createRef, Polygon, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Polygon.cornerRadius}: a sharp-cornered pentagon rounding its vertices into smooth arcs. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const pentagon = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={pentagon}
            width={280}
            height={280}
            sides={5}
            cornerRadius={0}
            fill={'accent'}
            center={() => stage.root.center}
        />,
    );

    yield* pentagon().to({ cornerRadius: 50 }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
