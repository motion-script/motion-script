import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.directionalBlur}: a horizontal smear grows from sharp to a long streak, like a motion-blurred pan. */
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
                effects={Effects.directionalBlur(0)}
            >
                <Text text={'SPEED'} fontFamily={'Inter'} fontWeight={800} fontSize={56} fill={'#0d0f15'} />
            </Rect>
        </Rect>,
    );
}, [
    () => card().to({ effects: Effects.directionalBlur(60) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
