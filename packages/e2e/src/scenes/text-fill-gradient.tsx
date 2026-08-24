import { createScene, createRef, Text, Fills, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Text} `fill` as a linear gradient, sweeping its angle across the glyphs. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
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

    yield* label().to({ rotation: 360 }, 1.6, easeInOut('quad'));
    yield* holdTail(1.6);
});
