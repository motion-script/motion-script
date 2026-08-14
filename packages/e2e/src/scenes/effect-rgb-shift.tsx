import { createScene, createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Effects.rgbShift}: the red and blue planes pull apart horizontally, green stays put. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
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

    yield* label().to({ effects: Effects.rgbShift(20) }, 1.2, easeInOut('quad'));
    yield* holdTail(1.2);
});
