

import { createScene, createRef, Rect, easeInOut, wait } from "motion-script";
import { Latex } from "motion-script";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link Latex} node.
 * Left: a formula morphs between equations via the animatable `latex` prop.
 * Right: a static integral rendered larger.
 */
export default createScene(function* (stage) {
        stage.set({ fill: 'bg' });

        const formula = createRef<Latex>();
        const integral = createRef<Latex>();

        stage.add(
            nodeCard({
                label: 'Latex',
                stage: 'horizontal',
                gap: 64,
                children: (
                    <>
                        <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={24} fill={'bg'}>
                            <Latex ref={formula} latex={'a^2 + b^2 = c^2'} fontSize={72} fill={'#6990DD'} />
                        </Rect>
                        <Rect width={'fill'} height={'fill'} flow={'freeform'} cornerRadius={24} fill={'bg'}>
                            <Latex
                                ref={integral}
                                latex={'\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}'}
                                fontSize={56}
                                fill={'#F5C26B'}
                            />
                        </Rect>
                    </>
                ),
            })
        );

        yield* wait(0.6);
        yield* formula().to({ latex: 'E = mc^2' }, 0.6, easeInOut('quad'));
        yield* wait(0.6);
        yield* formula().to({ latex: 'a^2 + b^2 = c^2' }, 0.6, easeInOut('quad'));
        yield* wait(0.5);
});
