import { createScene, createRef, Rect, Fills, ImageFilters, easeInOut } from 'motion-script';
import { holdTail } from './_lib';

/** {@link ImageFilters.colorAdjustment}: brightness, contrast, saturation, vibrance, shadows, highlights, temperature, tint, and vignette all animating together for a full color-grade sweep. */
export default createScene(function* (stage) {
    stage.set({ fill: 'bg' });
    const rect = createRef<Rect>();
    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'freeform'} align={{ x: 0, y: 0 }}>
            <Rect
                ref={rect}
                width={320}
                height={320}
                cornerRadius={24}
                fill={Fills.image('kingfisher.jpg', {
                    fit: 'fill',
                    filters: ImageFilters.colorAdjustment({
                        brightness: 0,
                        contrast: 1,
                        saturation: 1,
                        vibrance: 0,
                        shadows: 0,
                        highlights: 0,
                        temperature: 0,
                        tint: 0,
                        vignette: 0,
                    }),
                })}
            />
        </Rect>,
    );

    yield* rect().to(
        {
            fill: Fills.image('kingfisher.jpg', {
                fit: 'fill',
                filters: ImageFilters.colorAdjustment({
                    brightness: 0.2,
                    contrast: 1.5,
                    saturation: 1.8,
                    vibrance: 0.6,
                    shadows: 0.3,
                    highlights: -0.3,
                    temperature: 0.4,
                    tint: -0.2,
                    vignette: 0.6,
                }),
            }),
        },
        1.6,
        easeInOut('quad'),
    );
    yield* holdTail(1.6);
});
