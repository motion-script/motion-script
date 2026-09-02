import { createRef, Text, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** Single-line text in the default style, fading + rising into place. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
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
}, [
    () => label().to({ opacity: 1, y: 0 }, 0.8, easeOut('cubic')),
    holdTail(0.8),
]);
