/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, Fill, easeInOutQuad } from "@motion-script/core";

/**
 * A single {@link Text} node cycling through every fill type — solid color,
 * linear gradient, conic gradient, radial gradient and image — by tweening its
 * `fill` from one to the next, so the glyphs are repainted in place.
 */
export class TextFillsScene extends Scene {
    readonly label = 'Text Fills';

    *build() {
        this.set({ fill: 'bg' });

        const textRef = createRef<Text>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} borderRadius={32} fill={'card'} padding={80}>
                    <Text
                        ref={textRef}
                        text={'FILL'}
                        fontSize={240}
                        fontWeight={800}
                        fill={Fill.color('#6990DD')}
                    />
                </Rect>
            </Rect>
        );

        const dur = 1.6;
        // color -> linear gradient
        yield* textRef().to({ fill: Fill.linearGradient(['#6990DD', '#E8617C'], { start: { x: -1, y: -1 }, end: { x: 1, y: 1 } }) } as any, dur, easeInOutQuad);
        // linear -> conic gradient
        yield* textRef().to({ fill: Fill.conicGradient(['#E8617C', '#F5C26B', '#6990DD', '#E8617C'], { startAngle: 0 }) } as any, dur, easeInOutQuad);
        // conic -> radial gradient
        yield* textRef().to({ fill: Fill.radialGradient(['#F5C26B', '#6990DD'], { center: { x: 0, y: 0 }, radius: 300 }) } as any, dur, easeInOutQuad);
        // radial -> image
        yield* textRef().to({ fill: Fill.image('./cat.jpg', { mode: 'fill' }) } as any, dur, easeInOutQuad);
        // image -> back to solid color for a clean loop
        yield* textRef().to({ fill: Fill.color('#6990DD') } as any, dur, easeInOutQuad);
    }
}
