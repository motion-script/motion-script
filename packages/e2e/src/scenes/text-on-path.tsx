import { createScene, createRef, Text, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Text.path}: a single line of text follows an arcing path instead of a straight baseline. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
    stage.add(
        <Text
            ref={label}
            text={'Curving Along the Arc'}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={40}
            fill={'primary'}
            path={'M -320 80 Q 0 -260 320 80'}
            center={() => stage.root.center}
            scale={0}
        />,
    );

    yield* label().to({ scale: 1 }, 1.2, easeInOut('back'));
    yield* holdTail(1.2);
});
