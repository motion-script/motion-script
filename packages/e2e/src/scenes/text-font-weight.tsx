import { createScene, createRef, Text, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Text.fontWeight}: the same word thickening from a thin 200 weight to a heavy 900. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
    stage.add(
        <Text
            ref={label}
            text={'Weight'}
            fontFamily={'Inter'}
            fontWeight={200}
            fontSize={84}
            fill={'#f4f6ff'}
            center={() => stage.root.center}
        />,
    );

    yield* label().to({ fontWeight: 900 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
