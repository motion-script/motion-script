

import { createScene, createRef, Text, Rect, wait, sequence } from "motion-script";
import { textCard } from "./text-card";

const BG = '#0D0F15';
const CREAM = '#F5ECD7';

/**
 * Cycles a single wrapped paragraph through every {@link Text} `textAlign`
 * value — `left`, `center`, `right`, and `justify` (which stretches word
 * spacing so every full line spans the box edge to edge) — with a label
 * announcing each mode as it switches. `textAlign` is a plain enum, so the
 * mode change is instant (`set()`), not tweened.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG, flow: 'vertical', gap: 24, padding: 80 });

    const mode = createRef<Text>();
    const paragraph = createRef<Text>();

    const para = 'Motion Script lays out wrapped text one line at a time, and textAlign decides how each of those lines sits inside the box.';

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'textAlign'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} fill={'card'} cornerRadius={32} flow={'vertical'} gap={32} padding={80}>
                <Text ref={mode} text={'left'} fontSize={36} fontWeight={700} fill={'#6990DD'} width={'fill'} textAlign={'start'} />
                <Text ref={paragraph} text={para} fontSize={44} fontWeight={500} fill={CREAM} width={'fill'} wrap={true} textAlign={'left'} />
            </Rect>
        </Rect>
    );

    const show = function* (label: string, align: 'left' | 'center' | 'right' | 'justify') {
        mode().set({ text: label });
        paragraph().set({ textAlign: align });
        yield* wait(1.1);
    };

    yield* sequence(
        show('left', 'left'),
        show('center', 'center'),
        show('right', 'right'),
        show('justify', 'justify'),
    );

    yield* wait(0.5);
});
