/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text, Fill, easeInOutQuad } from "@motion-script/core";

/**
 * A {@link Text} node with a drop shadow that animates its color, blur radius
 * and offset — from a tight glow tucked behind the glyphs to a soft, far-cast
 * shadow.
 */
export class TextShadowScene extends Scene {
    readonly label = 'Text Shadow';

    *build() {
        this.set({ fill: 'bg' });

        const textRef = createRef<Text>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text
                        ref={textRef}
                        text={'SHADOW'}
                        fontSize={200}
                        fontWeight={800}
                        fill={'white'}
                        shadow={{ fill: Fill.color('#6990DD', { opacity: 0.9 }), blur: 20, dx: 10, dy: 10 }}
                    />
                </Rect>
            </Rect>
        );

        // Grow the shadow out: shift hue, soften the blur, and cast it down-right.
        yield* textRef().to({ shadow: { fill: Fill.color('#E8617C', { opacity: 0.9 }), blur: 48, dx: 24, dy: 24 } }, 2, easeInOutQuad);
        // Pull it back in for a clean loop.
        yield* textRef().to({ shadow: { fill: Fill.color('#6990DD', { opacity: 0.9 }), blur: 0, dx: 0, dy: 0 } }, 2, easeInOutQuad);
    }
}
