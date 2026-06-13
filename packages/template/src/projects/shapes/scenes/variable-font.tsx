/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Rect, Text } from "@motion-script/core";

/**
 * Animates a {@link Text} node's `fontWeight` along a variable font's weight
 * axis, with a dashed stroke outlining the glyphs.
 */
export class VariableFontScene extends Scene {
    readonly label = 'Variable Font';

    *build() {
        this.set({ fill: 'bg' });

        const variableFontText = createRef<Text>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text ref={variableFontText} text={'MS'} fontSize={200} stroke={{ weight: 2, fill: 'white', dash: 5 }} />
                </Rect>
            </Rect>
        );

        yield* variableFontText().to({ fontWeight: 900 }, 2);
    }
}
