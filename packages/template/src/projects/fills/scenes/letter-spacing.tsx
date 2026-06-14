/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text } from "@motion-script/core";

/** Animates a {@link Text} node's `letterSpacing` to spread its glyphs apart. */
export class LetterSpacingScene extends Scene {
    readonly label = 'Letter Spacing';

    *build() {
        this.set({ fill: 'bg' });

        const letterSpacingText = createRef<Text>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text ref={letterSpacingText} text={'Hello'} letterSpacing={10} fontWeight={100} fontSize={100} fill={'white'} />
                </Rect>
            </Rect>
        );

        yield* letterSpacingText().to({ letterSpacing: 20 }, 2);
    }
}
