import { createScene, createRef, Text, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** Single-line text in the default style, fading + rising into place. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
    stage.add(
        <Text
            ref={label}
            text={'Motion Script'}
            fontFamily={'Inter'}
            fontSize={84}
            fill={'#f4f6ff'}
            opacity={0}
            y={30}
            center={() => stage.canvas.center}
        />,
    );

    yield* label().to({ opacity: 1, y: 0 }, 0.8, easeOut('cubic'));
    yield* holdTail(0.8);
});
