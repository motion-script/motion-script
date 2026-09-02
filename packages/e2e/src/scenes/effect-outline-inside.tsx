import { createRef, Ellipse, Rect, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.outline} with `position: 'inside'`: the band eats inward, leaving the footprint unchanged. */
const disc = createRef<Ellipse>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Ellipse
                ref={disc}
                width={280}
                height={280}
                fill={'primary'}
                effects={Effects.outline({ width: 0, color: '#f4f6ff', position: 'inside' })}
            />
        </Rect>,
    );
}, [
    () => disc().to(
        { effects: Effects.outline({ width: 26, color: '#f4f6ff', position: 'inside' }) },
        1.2,
        easeInOut('quad'),
    ),
    holdTail(1.2),
]);
