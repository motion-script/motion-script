import { createScene, createRef, Camera, Rect, Ellipse, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** A camera zooming in on a small scene of shapes. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const camera = createRef<Camera>();
    stage.add(
        <Camera ref={camera} width={'fill'} height={'fill'} zoom={1}>
            <Rect width={160} height={160} cornerRadius={16} fill={'primary'} x={-120} />
            <Ellipse width={140} height={140} fill={'accent'} x={120} />
        </Camera>,
    );

    yield* camera().to({ zoom: 2.4, lookAt: { x: 120, y: 0 } }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
