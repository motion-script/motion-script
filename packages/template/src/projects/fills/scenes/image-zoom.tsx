import { createScene, createRef, easeInOut, Fills, parallel, Rect, Text } from "motion-script";

/**
 * `zoom` + `anchor` — magnification, and the point it grows away from.
 *
 * `zoom` multiplies whatever scale `fit` resolved, so `2` always means "twice
 * the size it would otherwise have been", regardless of the fit mode or the
 * card's dimensions.
 *
 * `anchor` names the point of the *source* that lands on the same point of the
 * *box*. All three cards start on an identical frame — the cards are portrait
 * and the photo landscape, so `fit: 'fill'` has no slack on the vertical axis
 * and the anchor has nothing to shift yet. The zoom is what creates the slack,
 * and each card then holds its own point fixed while everything else expands
 * past the edges: the head, the breast, the perch.
 *
 * `anchor` lives in the same `[-1, 1]` y-up space as `pivot` and `align`, so the
 * nine named positions work here, and an explicit `{ x, y }` picks any point
 * between them.
 */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });

    const src = './kingfisher.jpg';
    const top = createRef<Rect>();
    const centre = createRef<Rect>();
    const bottom = createRef<Rect>();

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={'Image Zoom'}
                fontSize={96}
                fill={'gray'}
                width={'fill'}
                textAlign={'start'}
            />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={40}>
                <Rect
                    ref={top}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    flow={'vertical'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', anchor: 'topCenter' })}
                >
                    <Text text={"'topCenter'"} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    ref={centre}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    flow={'vertical'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill' })}
                >
                    <Text text={"'center'"} fontSize={56} fill={'white'} />
                </Rect>
                <Rect
                    ref={bottom}
                    width={'fill'} height={'fill'} cornerRadius={32} clip
                    flow={'vertical'} padding={40} gap={0}
                    fill={Fills.image(src, { fit: 'fill', anchor: 'bottomCenter' })}
                >
                    <Text text={"'bottomCenter'"} fontSize={56} fill={'white'} />
                </Rect>
            </Rect>
        </Rect>,
    );

    yield* parallel(
        top().to({ fill: Fills.image(src, { fit: 'fill', anchor: 'topCenter', zoom: 2 }) }, 2.6, easeInOut('quad')),
        centre().to({ fill: Fills.image(src, { fit: 'fill', zoom: 2 }) }, 2.6, easeInOut('quad')),
        bottom().to({ fill: Fills.image(src, { fit: 'fill', anchor: 'bottomCenter', zoom: 2 }) }, 2.6, easeInOut('quad')),
    );
});
