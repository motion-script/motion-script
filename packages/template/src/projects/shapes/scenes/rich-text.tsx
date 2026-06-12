/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Rect, Text, RichText } from "@motion-script/core";

/**
 * A {@link RichText} node mixing per-span fill, weight, size and stroke so a
 * single text run carries several distinct styles inline.
 */
export class RichTextScene extends Scene {
    readonly label = 'Rich Text';

    *build() {
        this.set({ fill: 'bg' });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} borderRadius={32} fill={'card'} padding={80}>
                    <RichText
                        width={'fill'}
                        fontSize={40}
                        spans={[
                            { text: 'Hello world this is ', fill: 'white', fontWeight: 200, fontSize: 30 },
                            { text: 'hello my name is', fill: 'white' },
                            { text: ' John', stroke: { fill: 'white', weight: 1.5 }, fontSize: 70, fontWeight: 600 },
                        ]}
                    />
                </Rect>
            </Rect>
        );
    }
}
