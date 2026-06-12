/** @jsxImportSource @motion-script/core/jsx */

import { Scene, Rect, Text, wait } from "@motion-script/core";

/** A bold {@link Text} node outlined with a colored stroke. */
export class TextStrokeScene extends Scene {
    readonly label = 'Text Stroke';

    *build() {
        this.set({ fill: 'bg' });

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} borderRadius={32} fill={'card'} padding={80}>
                    <Text text={'Stroke'} shadow={{ blur: 20, dx: 20, dy: 20, fill: 'red' }} fontSize={160} fontWeight={700} stroke={{ weight: 4, fill: 'white' }} />
                </Rect>
            </Rect>
        );
        yield* wait(1);
    }
}
