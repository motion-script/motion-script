import { createScene, createRef, easeInOut, Fills, ImageFilters, Rect, Text } from "motion-script";

/**
 * Filters on the *fill*, not on the node.
 *
 * Each card is a single `Rect` whose image fill carries a filter chain, with a
 * caption laid out inside it. A node `effects` chain would grade the caption
 * too — that is what forces the "wrap the background in its own node" dance —
 * whereas a filter stops at the fill layer it is attached to, so the text on top
 * stays sharp and unfiltered.
 *
 * The right-hand card animates its chain to show a filter tweening like any
 * other fill property.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const live = createRef<Rect>();
    const src = './kingfisher.jpg';

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={'Image Filters'}
                fontSize={96}
                fill={'gray'}
                width={'fill'}
                textAlign={'start'}
            />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={40}>
                <Rect
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', filters: ImageFilters.oilPaint(4) })}
                >
                    <Text text={'oilPaint'} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, {
                        fit: 'fill',
                        filters: ImageFilters.grayscale(1).dither({ levels: 3, matrix: 4, scale: 3 }),
                    })}
                >
                    <Text text={'grayscale + dither'} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    ref={live}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', filters: ImageFilters.halftone({ size: 8, angle: 30 }) })}
                >
                    <Text text={'halftone'} fontSize={56} fill={'white'} />
                </Rect>
            </Rect>
        </Rect>,
    );

    yield* live().to(
        {
            fill: Fills.image(src, {
                fit: 'fill',
                filters: ImageFilters.halftone({ size: 24, angle: 30 }),
            }),
        },
        2,
        easeInOut('quad'),
    );
});
