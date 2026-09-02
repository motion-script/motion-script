import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.rgbShift}: the red and blue planes pull apart horizontally, green stays put. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Text
                ref={label}
                text={'SIGNAL'}
                fontFamily={'Inter'}
                fontWeight={800}
                fontSize={96}
                fill={'#f4f6ff'}
                effects={Effects.rgbShift(0)}
            />
        </Rect>,
    );
}, [
    () => label().to({ effects: Effects.rgbShift(20) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
