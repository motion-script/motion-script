import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.chromaticAberration}: red/blue channel fringing grows as `amount` ramps up, mimicking lens dispersion. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: '#0d0f15' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'#0d0f15'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.chromaticAberration(0)}
            >
                <Text text={'FRINGE'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#f4f6ff'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.chromaticAberration(14) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
