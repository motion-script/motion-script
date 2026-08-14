

import { createScene, createRef, Rect, Text, Fills, easeInOut } from "motion-script";

/**
 * A single {@link Text} node cycling through every fill type — solid color,
 * linear gradient, conic gradient, radial gradient and image — by tweening its
 * `fill` from one to the next, so the glyphs are repainted in place.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const textRef = createRef<Text>();

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Text Fills"} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text
                        ref={textRef}
                        text={'FILL'}
                        fontSize={240}
                        fontWeight={800}
                        fill={Fills.color('#6990DD')}
                    />
                </Rect>
            </Rect>
        );

        const dur = 1.6;
        // color -> linear gradient
        yield* textRef().to({ fill: Fills.linearGradient(['#6990DD', '#E8617C'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }) } as any, dur, easeInOut('quad'));
        // linear -> conic gradient
        yield* textRef().to({ fill: Fills.conicGradient(['#E8617C', '#F5C26B', '#6990DD', '#E8617C'], { startAngle: 0 }) } as any, dur, easeInOut('quad'));
        // conic -> radial gradient
        yield* textRef().to({ fill: Fills.radialGradient(['#F5C26B', '#6990DD'], { center: { x: 0, y: 0 }, radius: 300 }) } as any, dur, easeInOut('quad'));
        // radial -> image
        yield* textRef().to({ fill: Fills.image('./cat.jpg', { fit: 'fill' }) } as any, dur, easeInOut('quad'));
        // image -> back to solid color for a clean loop
        yield* textRef().to({ fill: Fills.color('#6990DD') } as any, dur, easeInOut('quad'));
});
