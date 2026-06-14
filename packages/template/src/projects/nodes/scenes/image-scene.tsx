/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Image, Rect, Text, easeInOutQuad, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Image} node.
 * Three instances of the same image rendered with different fit modes.
 * Corner radius animates in on all three simultaneously.
 */
export class ImageScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });

        const refs = [createRef<Image>(), createRef<Image>(), createRef<Image>()];
        const fits: Array<'fill' | 'fit' | 'crop'> = ['fill', 'fit', 'crop'];

        this.add(
            nodeCard({
                label: 'Image',
                stage: 'row',
                gap: 48,
                children: fits.map((fit, i) => (
                    <Rect key={i} width={'fill'} height={'fill'} group={'column'} gap={16} alignment={{ x: 0, y: 1 }}>
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
                            align={'center'}
                            width={'fill'}
                        />
                    </Rect>
                )),
            })
        );

        yield* parallel(
            ...refs.map((ref) => ref().to({ cornerRadius: 24 }, 1.2, easeInOutQuad))
        );
        yield* wait(1.5);
        yield* parallel(
            ...refs.map((ref) => ref().to({ cornerRadius: 0 }, 0.8, easeInOutQuad))
        );
        yield* wait(0.5);
    }
}
