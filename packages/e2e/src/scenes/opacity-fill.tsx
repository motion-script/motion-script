import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Fill-level `opacity`: only the fill itself fades, leaving the stroke fully opaque throughout. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={Fills.color('primary', { opacity: 1 })}
            stroke={{ weight: 6, fill: '#f4f6ff' }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => card().to({ fill: Fills.color('primary', { opacity: 0.1 }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
