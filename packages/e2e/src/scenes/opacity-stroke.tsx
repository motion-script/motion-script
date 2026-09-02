import { createRef, Rect, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Stroke-level `opacity`: only the stroke fades, leaving the fill fully opaque throughout. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect
            ref={card}
            width={300}
            height={200}
            cornerRadius={20}
            fill={'card'}
            stroke={{ weight: 10, align: 'center', fill: Fills.color('primary', { opacity: 1 }) }}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => card().strokeTo({ fill: Fills.color('primary', { opacity: 0.1 }) }, 1.2, { ease: easeInOut('quad') }),
    holdTail(1.2),
]);
