import { createScene, createRef, easeInOut, Fills, parallel, Rect, Text, wait } from "motion-script";

/**
 * `crop` and `zoom` together — the whole placement pipeline in one scene:
 *
 *     crop → fit → zoom → anchor
 *
 * Each stage is independent, which is what lets them compose. `crop` picks the
 * window; `fit` scales *that window* to cover the card; `zoom` multiplies the
 * scale it resolved; `anchor` decides which point stays put while it grows.
 *
 * Both cards start from the same untouched frame and run in parallel. The left
 * one only crops, so it reframes without ever magnifying — the bird stays the
 * size it was, there is just less around it. The right one crops *and* zooms
 * about the bird's head, so it reframes and pushes in at once, in a single
 * tween. Comparing the two is the point: the crop is doing the reframing in
 * both, and the zoom is a separate multiplier stacked on top.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const src = './kingfisher.jpg';
    const cropOnly = createRef<Rect>();
    const cropZoom = createRef<Rect>();

    // The bird's head, in the [-1,1] y-up anchor space: left of centre, above
    // the middle. Holding it fixed is what makes the push read as a camera move
    // rather than a scale.
    const head = { x: 0, y: 0 };
    const window = { right: 0.6 };

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={'Crop + Zoom'}
                fontSize={96}
                fill={'gray'}
                width={'fill'}
                textAlign={'start'}
            />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={40}>
                <Rect
                    ref={cropOnly}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill' })}
                >
                    <Text text={'crop'} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    ref={cropZoom}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', crop: window, anchor: head })}
                >
                    <Text text={'crop + zoom'} fontSize={56} fill={'white'} />
                </Rect>
            </Rect>
        </Rect>,
    );

    yield* parallel(

        cropZoom().to(
            { fill: Fills.image(src, { fit: 'fill', zoom: 1.9, anchor: head }) },
            2.6,
            easeInOut('quad'),
        ),
    );

    yield* wait(0.8);
});
