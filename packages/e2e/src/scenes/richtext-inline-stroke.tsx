import { createScene, createRef, RichText, easeOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link RichText} per-span `stroke`: one word in a sentence gets its own outline, distinct from its plain-fill neighbors. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const para = createRef<RichText>();
    stage.add(
        <RichText
            ref={para}
            fontFamily={'Inter'}
            fontSize={48}
            fontWeight={700}
            fill={'#f4f6ff'}
            opacity={0}
            center={() => stage.root.center}
            spans={[
                { text: 'Stay ' },
                { text: 'OUTLINED', fill: 'transparent', stroke: { weight: 3, fill: 'accent' } },
                { text: ' today' },
            ]}
        />,
    );

    yield* para().to({ opacity: 1 }, 0.8, easeOut('quad'));
    yield* holdTail(0.8);
});
