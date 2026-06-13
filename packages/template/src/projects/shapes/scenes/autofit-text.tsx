/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text } from "@motion-script/core";

/**
 * A {@link Text} node with `fontSize: 'autofit'` that re-fits its size to the
 * available box as its content grows. The tweens change, append and prepend
 * text so the font scales down to keep everything inside the stroked frame.
 */
export class AutofitTextScene extends Scene {
    readonly label = 'Autofit Text';

    *build() {
        this.set({ fill: 'bg' });

        const autoFitText = createRef<Text>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Rect width={'fill'} height={'fill'} cornerRadius={20} stroke={{ fill: 'orange', weight: 10 }} padding={40}>
                        <Text ref={autoFitText} fontStyle={'italic'} text={'Hello world! '} width={'fill'} fill={'white'} wrap={true} minFontSize={40} fontSize={'autofit'} align={'center'} />
                    </Rect>
                </Rect>
            </Rect>
        );

        yield* autoFitText().to({ text: 'Hello world! and this is cool' }, 2);
        yield* autoFitText().append(' Appending more text.', 2);
        yield* autoFitText().prepend('Prepended: ', 2);
    }
}
