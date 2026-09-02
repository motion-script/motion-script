import { createRef, Rect, Text, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * A wrapped paragraph in a fixed-width box. Animating the box `width` narrower
 * forces the text to re-flow onto more lines, so the wrap is visibly exercised
 * (the mid frame catches the paragraph mid-reflow).
 */
const box = createRef<Rect>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={box}
                width={620}
                height={360}
                cornerRadius={20}
                fill={'card'}
                flow={'freeform'}
                align={{ x: 0, y: 0 }}
                padding={40}
            >
                <Text
                    text={'Motion Script lays out wrapped text one line at a time, breaking on word boundaries to fit the box.'}
                    fontSize={40}
                    fontWeight={500}
                    fill={'#f4f6ff'}
                    width={'fill'}
                    wrap={true}
                    textAlign={'start'}
                />
            </Rect>
        </Rect>,
    );
}, [
    () => box().to({ width: 320 }, 1.3, easeInOut('quad')),
    holdTail(1.3),
]);
