

import { createScene, Rect, Text, RichText } from "motion-script";

/**
 * A {@link RichText} node mixing per-span fill, weight, size and stroke so a
 * single text run carries several distinct styles inline.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        stage.add(
            <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={"Rich Text"} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
                <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={32} fill={'card'} padding={80}>
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
});
