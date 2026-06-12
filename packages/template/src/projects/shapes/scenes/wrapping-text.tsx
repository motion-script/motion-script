/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Rect, Text } from "@motion-script/core";

/**
 * A {@link Text} node with `wrap` enabled and `fontSize: 'autofit'`, so a long
 * paragraph wraps across lines and scales to fill the available card.
 */
export class WrappingTextScene extends Scene {
    readonly label = 'Wrapping Text';

    *build() {
        this.set({ fill: 'bg' });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} borderRadius={32} fill={'card'} padding={80}>
                    <Text text={'Motion Script! This is a wonderful app filled with powerful tools for animation and video making.'} fontSize={'autofit'} minFontSize={40} fill={'white'} wrap={true} />
                </Rect>
            </Rect>
        );
    }
}
