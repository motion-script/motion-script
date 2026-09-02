import { createRef, Rect, Text, Effects, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/** {@link Effects.outline}: a band grows outward from the glyph silhouette as `width` ramps up. */
const label = createRef<Text>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Text
                ref={label}
                text={'EDGE'}
                fontFamily={'Inter'}
                fontWeight={800}
                fontSize={120}
                fill={'#f4f6ff'}
                effects={Effects.outline({ width: 0, color: 'accent' })}
            />
        </Rect>,
    );
}, [
    () => label().to({ effects: Effects.outline({ width: 14, color: 'accent' }) }, 1.2, easeInOut('quad')),
    holdTail(1.2),
]);
