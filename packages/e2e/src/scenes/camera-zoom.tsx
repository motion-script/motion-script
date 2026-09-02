import { createRef, Camera, Rect, Ellipse, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A camera zooming in on a small scene of shapes. */
const camera = createRef<Camera>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Camera ref={camera} width={'fill'} height={'fill'} zoom={1}>
            <Rect width={160} height={160} cornerRadius={16} fill={'primary'} x={-120} />
            <Ellipse width={140} height={140} fill={'accent'} x={120} />
        </Camera>,
    );
}, [
    () => camera().to({ zoom: 2.4, lookAt: { x: 120, y: 0 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
