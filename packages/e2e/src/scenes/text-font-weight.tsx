import { createRef, Text, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Text.fontWeight}: the same word thickening from a thin 200 weight to a heavy 900. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Text
            ref={label}
            text={'Weight'}
            fontFamily={'Inter'}
            fontWeight={200}
            fontSize={84}
            fill={'#f4f6ff'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => label().to({ fontWeight: 900 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
