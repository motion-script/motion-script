import { createScene, createRef, easeInOut, Fills, Rect, Text } from "motion-script";

/**
 * `crop` — a window onto the source, applied *before* `fit`.
 *
 * The insets are **fractions of the source's own size** (0–1), not pixels, so
 * the same value reads identically at 1× and 4K and survives swapping `src` for
 * a differently-sized asset. It takes the `padding` shorthands: a bare number,
 * `{ horizontal, vertical }`, or per-side.
 *
 * The thing to notice is that all three cards are still filled edge-to-edge.
 * Everything after the crop treats the window *as if it were the whole image*,
 * so the cover scale is recomputed against it — a crop composes with `fit`
 * rather than fighting it, and never letterboxes.
 *
 * The right-hand card animates its crop shut, which is the same lerp any other
 * fill property gets.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const src = './kingfisher.jpg';
    const live = createRef<Rect>();

    stage.add(
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={'Image Crop'}
                fontSize={96}
                fill={'gray'}
                width={'fill'}
                textAlign={'start'}
            />
            <Rect width={'fill'} height={'fill'} group={'row'} gap={40}>
                <Rect
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill' })}
                >
                    <Text text={'no crop'} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', crop: { horizontal: 0.3 } })}
                >
                    <Text text={'crop sides 30%'} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    ref={live}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    group={'column'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', crop: { left: 0.42, top: 0.1, bottom: 0.28 } })}
                >
                    <Text text={'per-side, opening'} fontSize={56} fill={'white'} />
                </Rect>
            </Rect>
        </Rect>,
    );

    yield* live().to({ fill: Fills.image(src, { fit: 'fill', crop: 0 }) }, 2.4, easeInOut('quad'));
});
