import { createRef, RichText, easeOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link RichText} `spans`: a sentence mixing default, bold/accent, and italic runs in one node, fading in. */
const para = createRef<RichText>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <RichText
            ref={para}
            fontFamily={'Inter'}
            fontSize={44}
            fill={'#f4f6ff'}
            opacity={0}
            center={() => stage.canvas.center}
            spans={[
                { text: 'Motion Script makes ' },
                { text: 'rich text', fontWeight: 800, fill: 'accent' },
                { text: ' easy with ' },
                { text: 'styled spans', fontStyle: 'italic', fill: 'primary' },
                { text: '.' },
            ]}
        />,
    );
}, [
    () => para().to({ opacity: 1 }, 0.8, easeOut('quad')),
    holdTail(0.8),
]);
