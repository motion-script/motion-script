import { createScene, createRef, RichText, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link RichText} `spans`: a sentence mixing default, bold/accent, and italic runs in one node, fading in. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const para = createRef<RichText>();
    stage.add(
        <RichText
            ref={para}
            fontFamily={'Inter'}
            fontSize={44}
            fill={'#f4f6ff'}
            opacity={0}
            center={() => stage.root.center}
            spans={[
                { text: 'Motion Script makes ' },
                { text: 'rich text', fontWeight: 800, fill: 'accent' },
                { text: ' easy with ' },
                { text: 'styled spans', fontStyle: 'italic', fill: 'primary' },
                { text: '.' },
            ]}
        />,
    );

    yield* para().to({ opacity: 1 }, 0.8, easeOut('quad'));
    yield* holdTail(0.8);
});
