import { createScene, createRef, Ellipse, FX, Text, Rect, wait, Stage, parallel, easeOut } from "motion-script";

export default createScene(function* (stage) {
        stage.set({ fill: "bg", padding: 80 });
        const colA = createRef<Rect>();
        const colB = createRef<Rect>();
        const rowA = createRef<Rect>();
        const rowB = createRef<Rect>();

        stage.add(
            <>
                <Rect gap={20} group={'row'} padding={10} width={1000} height={600}>
                    <Rect ref={colA} width={'fill'} flex={1} fill={'card'} cornerRadius={8} />
                    <Rect group={'column'} gap={20} height={'fill'} width={'fill'} flex={2} >
                        <Rect ref={rowA} height={'fill'} width={'fill'} flex={2} cornerRadius={4} stroke={{ fill: 'white', weight: 12 }} fill={'#FF6470'} >

                            <Ellipse width={32} height={32} fill={'white'} />

                        </Rect>
                        <Rect ref={rowB} height={'fill'} flex={1} fill={'card'} cornerRadius={8} />

                    </Rect>
                    {/* flex implies width 'fill'; this column takes 1 share like the red one */}
                    <Rect ref={colB} flex={2} fill={'card'} cornerRadius={8} />
                </Rect>
            </>,
        );
        yield* parallel(
            colA().to({ flex: 2 }, 0.5, easeOut('quad')),

            colB().to({ flex: 1 }, 0.5, easeOut('quad')),

        );
        yield* rowA().to({ flex: 1 }, 0.5, easeOut('quad'));
        yield* parallel(
            colA().to({ flex: 1 }, 0.5, easeOut('quad')),

            colB().to({ flex: 2 }, 0.5, easeOut('quad')),

        );

        yield* rowA().to({ flex: 2 }, 0.5, easeOut('quad'));
});
