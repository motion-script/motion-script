import { createRef, Rect, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Node2D-level `opacity`: the whole node — fill, stroke, and children together — fades as one unit. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={'primary'}
            stroke={{ weight: 6, fill: '#f4f6ff' }}
            opacity={1}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => card().to({ opacity: 0.1 }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
