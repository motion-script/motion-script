import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** A Gaussian blur effect ramping up on a labelled card. */
const card = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={card}
                width={360}
                height={240}
                cornerRadius={20}
                fill={'primary'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                effects={Effects.blur(0)}
            >
                <Text text={'BLUR'} fontFamily={'Inter'} fontSize={64} fill={'#0d0f15'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.blur(18) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
