import { createRef, Text, Fills, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Text} `fill` as a linear gradient, sweeping its angle across the glyphs. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Text
            ref={label}
            text={'Gradient Text'}
            fontFamily={'Inter'}
            fontWeight={800}
            fontSize={72}
            fill={Fills.linearGradient(['#6990dd', '#e8617c'])}
            rotation={0}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => label().to({ rotation: 360 }, 1.6, easeInOut('quad')),
    holdTail(1.6),
]);
