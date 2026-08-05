import { createScene, createRef, Camera, GridPattern, Rect, Ellipse, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Camera combined: `zoom`, `origin`, and `heading` all animate together in a
 * single tween, so the viewport simultaneously dollies in, pans toward a
 * landmark, and rolls. The mid frame catches every channel part-way, a pose
 * distinct from both the wide start and the tight, tilted finish.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const camera = createRef<Camera>();

    stage.add(
        <Camera
            ref={camera}
            width={'fill'}
            height={'fill'}
            zoom={1}
            heading={0}
            lookAt={{ x: 0, y: 0 }}
        >
            <GridPattern
                cellSize={120}
                subdivisions={2}
                fill={Fills.color('bg')}
                stroke={{ weight: 3, fill: Fills.color('primary', { opacity: 0.5 }) }}
                subStroke={{ weight: 1.5, fill: Fills.color('primary', { opacity: 0.25 }) }}
            />
            <Rect width={150} height={150} cornerRadius={20} fill={'primary'} x={-220} y={-40} />
            <Ellipse width={150} height={150} fill={'accent'} x={210} y={140} />
            <Rect width={130} height={130} cornerRadius={20} fill={'#F5C26B'} x={150} y={-160} />
        </Camera>,
    );

    // All three viewport channels move at once: dolly in, pan to the accent
    // ellipse, and roll the view.
    yield* camera().to({ zoom: 2.2, lookAt: { x: 210, y: 140 }, heading: 30 }, 1.5, easeInOut('quad'));
    yield* holdTail(1.5);
});
