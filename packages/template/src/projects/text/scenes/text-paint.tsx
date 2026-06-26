/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, Text, Rect, Fills, wait, easeInOut } from "@motion-script/core";

const BG = '#0D0F15';

/**
 * Combines the three paint channels a {@link Text} node carries at once: a
 * gradient `fill`, a contrasting `stroke` outline, and a drop `shadow` —
 * tweened together so the glyphs read as a single cohesive treatment rather
 * than three separate demos.
 */
export default createScene(function* (stage) {
    stage.set({ fill: BG });

    const textRef = createRef<Text>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={'Fill + Stroke + Shadow'} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                <Text
                    ref={textRef}
                    text={'PAINT'}
                    fontSize={220}
                    fontWeight={800}
                    fill={Fills.linearGradient(['#6990DD', '#E8617C'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } })}
                    stroke={{ fill: '#0D0F15', weight: 6 }}
                    shadow={{ fill: Fills.color('#000000', { opacity: 0.6 }), blur: 0, offset: { x: 0, y: 0 } }}
                />
            </Rect>
        </Rect>
    );

    yield* wait(0.4);

    yield* textRef().to({
        fill: Fills.linearGradient(['#F5C26B', '#29EC71'], { start: { x: -1, y: 1 }, end: { x: 1, y: -1 } }),
        stroke: { fill: '#0D0F15', weight: 6 },
        shadow: { fill: Fills.color('#29EC71', { opacity: 0.5 }), blur: 36, offset: { x: 16, y: 16 } },
    } as any, 2, easeInOut('quad'));

    yield* wait(0.4);

    yield* textRef().to({
        fill: Fills.linearGradient(['#6990DD', '#E8617C'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }),
        shadow: { fill: Fills.color('#000000', { opacity: 0.6 }), blur: 0, offset: { x: 0, y: 0 } },
    } as any, 2, easeInOut('quad'));

    yield* wait(1);
});
