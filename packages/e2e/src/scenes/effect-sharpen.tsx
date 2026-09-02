import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.sharpen}: edge contrast rises (and finally haloes) as `amount` ramps up. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={420}
                height={280}
                cornerRadius={20}
                fill={'card'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.sharpen({ amount: 0, radius: 3 })}
            >
                <Text text={'SHARP'} fontFamily={'Inter'} fontWeight={700} fontSize={72} fill={'primary'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.sharpen({ amount: 3, radius: 3 }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
