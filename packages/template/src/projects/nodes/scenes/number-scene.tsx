/** @jsxImportSource @motion-script/core/jsx */

import { createScene, createRef, NumberNode, Rect, easeOut, parallel, wait } from "@motion-script/core";
import { nodeCard } from "./node-card";

/**
 * Showcases the {@link NumberNode} node.
 * Demonstrates the three `Intl.NumberFormat` styles — currency, percent, and
 * plain number — each counting up from 0 via a `value` tween, with grouping
 * and locale handled by `Intl` so the display stays locale-correct.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const currencyRef = createRef<NumberNode>();
    const percentRef = createRef<NumberNode>();
    const numberRef = createRef<NumberNode>();

    stage.add(
        nodeCard({
            label: 'Number',
            stage: 'row',
            gap: 80,
            children: (
                <>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <NumberNode
                            ref={currencyRef}
                            value={0}
                            format={'currency'}
                            currencyCode={'USD'}
                            locale={'en-US'}
                            fontSize={64}
                            fontWeight={700}
                            fill={'primary'}
                            textAlign={'center'}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <NumberNode
                            ref={percentRef}
                            value={0}
                            format={'percent'}
                            decimals={1}
                            fontSize={64}
                            fontWeight={700}
                            fill={'white'}
                            textAlign={'center'}
                        />
                    </Rect>
                    <Rect width={'fill'} height={'fill'} group={'stack'} cornerRadius={24} fill={'bg'}>
                        <NumberNode
                            ref={numberRef}
                            value={0}
                            format={'number'}
                            locale={'de-DE'}
                            decimals={0}
                            fontSize={64}
                            fontWeight={700}
                            fill={'#F5C26B'}
                            textAlign={'center'}
                        />
                    </Rect>
                </>
            ),
        })
    );

    yield* parallel(
        currencyRef().countTo(1299.99, 1.8, easeOut('quart')),
        percentRef().countTo(0.876, 1.8, easeOut('quart')),
        numberRef().countTo(1_250_000, 1.8, easeOut('quart')),
    );

    yield* wait(1);
});
