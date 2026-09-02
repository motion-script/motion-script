import { createRef, Text, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Text.letterSpacing}: glyphs spread apart from tight (0) to loose (16). */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Text
            ref={label}
            text={'SPACING'}
            fontFamily={'Inter'}
            fontWeight={700}
            fontSize={64}
            letterSpacing={0}
            fill={'#f4f6ff'}
            center={() => stage.canvas.center}
        />,
    );
}, [
    () => label().to({ letterSpacing: 16 }, 1.4, easeInOut('quad')),
    holdTail(1.4),
]);
