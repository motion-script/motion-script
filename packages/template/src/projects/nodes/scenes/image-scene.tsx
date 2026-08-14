

import { createScene, createRef, Image, Rect, Text, easeInOut, parallel, wait } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Image} node.
 * Three instances of the same image rendered with different fit modes.
 * Corner radius animates in on all three simultaneously.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const refs = [createRef<Image>(), createRef<Image>(), createRef<Image>()];
    const fits: Array<'fill' | 'fit' | 'stretch'> = ['fill', 'fit', 'stretch'];

    stage.add(
        nodeCard({
            label: 'Image',
            stage: 'horizontal',
            gap: 48,
            children: fits.map((fit, i) => (
                <Rect width={'fill'} height={'fill'} flow={'vertical'} gap={16} align={{ x: 0, y: 1 }}>
                    <Image
                        ref={refs[i]}
                        src={'kingfisher.jpg'}
                        fit={fit}
                        width={'fill'}
                        height={'fill'}
                        cornerRadius={0}
                    />
                    <Text
                        text={`fit: '${fit}'`}
                        fontSize={28}
                        fill={'gray'}
                        textAlign={'center'}
                        width={'fill'}
                    />
                </Rect>
            )),
        })
    );

    yield* parallel(
        ...refs.map((ref) => ref().to({ cornerRadius: 24 }, 1.2, easeInOut('quad')))
    );
    yield* wait(1.5);
    yield* parallel(
        ...refs.map((ref) => ref().to({ cornerRadius: 0 }, 0.8, easeInOut('quad')))
    );
    yield* wait(0.5);
});
