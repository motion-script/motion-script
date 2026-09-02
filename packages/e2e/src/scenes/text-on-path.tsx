import { createRef, Text, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Text.path}: a single line of text follows an arcing path instead of a straight baseline. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Text
            ref={label}
            text={'Curving Along the Arc'}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={40}
            fill={'primary'}
            path={'M -320 80 Q 0 -260 320 80'}
            center={() => stage.canvas.center}
            scale={0}
        />,
    );
}, [
    () => label().to({ scale: 1 }, 1.2, easeInOut('back')),
    holdTail(1.2),
]);
