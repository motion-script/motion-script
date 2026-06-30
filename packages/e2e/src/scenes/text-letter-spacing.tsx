import { createScene, createRef, Text, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link Text.letterSpacing}: glyphs spread apart from tight (0) to loose (16). */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const label = createRef<Text>();
    stage.add(
        <Text
            ref={label}
            text={'SPACING'}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={64}
            letterSpacing={0}
            fill={'#f4f6ff'}
            center={() => stage.root.center}
        />,
    );

    yield* label().to({ letterSpacing: 16 }, 1.4, easeInOut('quad'));
    yield* holdTail(1.4);
});
