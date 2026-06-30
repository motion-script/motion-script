import { createScene, createRef, Camera, GridPattern, Rect, Ellipse, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/**
 * Camera heading: the view rotates about its centre via `heading` (degrees)
 * while `zoom` and `origin` hold still. The whole world — grid and landmark
 * shapes — visibly tilts; the mid frame shows it caught at roughly half the
 * rotation.
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
            origin={{ x: 0, y: 0 }}
        >
            <GridPattern
                cellSize={120}
                subdivisions={2}
                fill={Fills.color('bg')}
                stroke={{ weight: 3, fill: Fills.color('primary', { opacity: 0.5 }) }}
                subStroke={{ weight: 1.5, fill: Fills.color('primary', { opacity: 0.25 }) }}
            />
            <Rect width={150} height={150} cornerRadius={20} fill={'primary'} x={-180} y={-140} />
            <Ellipse width={140} height={140} fill={'accent'} x={170} y={120} />
            <Rect width={130} height={130} cornerRadius={20} fill={'#F5C26B'} x={150} y={-150} />
        </Camera>,
    );

    // Rotate the camera view only — zoom and origin stay put.
    yield* camera().to({ heading: 60 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
