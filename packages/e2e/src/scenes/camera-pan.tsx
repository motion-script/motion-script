import { createRef, Camera, GridPattern, Rect, Ellipse, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * Camera pan: the `lookAt` (world-space focus point) slides laterally while
 * `zoom` and `heading` stay fixed, so the grid and the landmark shapes scroll
 * across the viewport. The mid frame catches the world part-way through the
 * pan, with different shapes framed than at the start.
 */
const camera = createRef<Camera>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Camera
            ref={camera}
            width={'fill'}
            height={'fill'}
            zoom={1}
            heading={0}
            lookAt={{ x: -260, y: 0 }}
        >
            <GridPattern
                cellSize={120}
                subdivisions={2}
                fill={Fills.color('bg')}
                stroke={{ weight: 3, fill: Fills.color('primary', { opacity: 0.5 }) }}
                subStroke={{ weight: 1.5, fill: Fills.color('primary', { opacity: 0.25 }) }}
            />
            <Rect width={150} height={150} cornerRadius={20} fill={'primary'} x={-260} y={-30} />
            <Ellipse width={150} height={150} fill={'accent'} x={0} y={60} />
            <Rect width={150} height={150} cornerRadius={20} fill={'#F5C26B'} x={260} y={-30} />
        </Camera>,
    );
}, [
    // Pan only the lookAt: from the left landmark across to the right one.
    () => camera().to({ lookAt: { x: 260, y: 0 } }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
