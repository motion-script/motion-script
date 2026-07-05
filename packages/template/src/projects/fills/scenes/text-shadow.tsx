

import { createScene, createRef, Rect, Text, Fills, easeInOut } from "motion-script";

/**
 * A {@link Text} node with a drop shadow that animates its color, blur radius
 * and offset — from a tight glow tucked behind the glyphs to a soft, far-cast
 * shadow.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const textRef = createRef<Text>();

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Text Shadow"} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text
                        ref={textRef}
                        text={'SHADOW'}
                        fontSize={200}
                        fontWeight={800}
                        fill={'white'}
                        shadow={{ fill: Fills.color('#6990DD', { opacity: 0.9 }), blur: 20, offset: { x: 10, y: 10 } }}
                    />
                </Rect>
            </Rect>
        );

        // Grow the shadow out: shift hue, soften the blur, and cast it down-right.
        yield* textRef().to({ shadow: { fill: Fills.color('#E8617C', { opacity: 0.9 }), blur: 48, offset: { x: 24, y: 24 } } }, 2, easeInOut('quad'));
        // Pull it back in for a clean loop.
        yield* textRef().to({ shadow: { fill: Fills.color('#6990DD', { opacity: 0.9 }), blur: 0, offset: { x: 0, y: 0 } } }, 2, easeInOut('quad'));
});
