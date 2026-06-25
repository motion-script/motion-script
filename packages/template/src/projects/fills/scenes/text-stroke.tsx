/** @jsxImportSource @motion-script/core/jsx */

import { createScene, Rect, Text, wait } from "@motion-script/core";

/** A bold {@link Text} node outlined with a colored stroke. */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        stage.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Text Stroke"} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={32} fill={'card'} padding={80}>
                    <Text text={'Stroke'} shadow={{ blur: 20, offset: { x: 20, y: 20 }, fill: 'red' }} fontSize={160} fontWeight={700} stroke={{ weight: 4, fill: 'white' }} />
                </Rect>
            </Rect>
        );
        yield* wait(1);
});
