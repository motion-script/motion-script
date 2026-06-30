import { createScene, createRef, Polygon, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A regular pentagon (`sides={5}`, the default) spinning into view. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const pentagon = createRef<Polygon>();
    stage.add(
        <Polygon
            ref={pentagon}
            width={300}
            height={300}
            sides={5}
            fill={'accent'}
            rotation={-90}
            scale={0.6}
            center={() => stage.root.center}
        />,
    );

    yield* pentagon().to({ rotation: 0, scale: 1 }, 1.3, easeInOut('back'));
    yield* holdTail(1.3);
});
