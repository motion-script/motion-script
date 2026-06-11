/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Reference, Text, Rect, Ellipse, Image, ShapeNode, Grid, FX, EffectChain, easeOutQuad, easeInOutQuad, parallel } from "@motion-script/core";

export class EffectScene extends Scene {
    *build() {
        this.set({ fill: 'bg' });
        const cardColor = 'card';

        const refs: Array<Reference<ShapeNode<any>>> = [];

        // When `background` is true, the effect is carried by an Ellipse layered
        // over the image instead of by the image itself. Backdrop-reading effects
        // (backgroundBlur, magnify) need content *behind* the affected node, so this
        // makes them legible — they blur / magnify the image beneath the ellipse.
        const cell = (label: string, effect: EffectChain, background = false) => {
            const ref = createRef<any>();
            refs.push(ref);
            return (
                <Rect height={'fill'} stroke={{ weight: 2, fill: cardColor }} group={'column'} padding={20} gap={10} colSpan={1} width={'fill'}>
                    <Text text={label} fontSize={18} fill={'white'} opacity={0.4} align={'left'} width={'fill'} />
                    <Rect borderRadius={16} width={'fill'} height={'fill'} clip={true}>
                        {background ? (
                            <Rect width={'fill'} height={'fill'}>
                                <Image src={'./cat.jpg'} fit={'fill'} width={200} height={'fill'} >
                                    <Ellipse ref={ref} width={'fill'} height={'fill'} effects={effect} />

                                </Image>
                            </Rect>
                        ) : (
                            <Image ref={ref} src={'./cat.jpg'} width={'fill'} height={'fill'} effects={effect} />
                        )}
                    </Rect>
                </Rect>
            );
        };

        // Inert starting states — each animates to its active value below.
        this.add(<Grid columns={3} width={'fill'} height={'fill'}>
            {cell('Blur', FX.blur(0))}
            {cell('Directional blur', FX.directionalBlur(0, 0))}
            {cell('Background blur', FX.backgroundBlur(0), true)}
            {cell('Grayscale', FX.grayscale(0))}
            {cell('Pixelate', FX.pixelate(64))}
            {cell('Bulge', FX.bulge(0))}
            {cell('Magnify', FX.magnify(1), true)}
            {cell('Bloom', FX.bloom(0.6, 12, 0))}
            {cell('Vintage', FX.vintage(0, 0))}
            {cell('Chromatic aberration', FX.chromaticAberration(0, 0))}
            {cell('Scatter', FX.scatter(0))}
            {cell('Posterize', FX.posterize(32))}
            {cell('Frosted', FX.grayscale(0).blur(0))}
            {cell('Retro VHS', FX.vintage(0, 0).chromaticAberration(0, 0))}
            {cell('Invert', FX.invert('rgba', 0))}
        </Grid>);

        const active: EffectChain[] = [
            FX.blur(8),
            FX.directionalBlur(0, 40),
            FX.backgroundBlur(16),
            FX.grayscale(1),
            FX.pixelate(24),
            FX.bulge(0.6),
            FX.magnify(1.8),
            FX.bloom(0.6, 24, 1.5),
            FX.vintage(1, 0.4),
            FX.chromaticAberration(8, 0),
            FX.scatter(12),
            FX.posterize(4),
            FX.grayscale(1).blur(6),
            FX.vintage(0.9, -0.2).chromaticAberration(6, 90),
            FX.invert('rgba', 1)
        ];

        // for (let i = 0; i < refs.length; i++) {
        //     yield* refs[i]().to({ effects: active[i] }, 0.6, easeOutQuad);
        // }
        yield* parallel(...refs.map((r, i) => r().to({ effects: active[i] }, 3, easeOutQuad)))

        yield* this.motionBlurDemo();
    }

    /**
     * Motion blur is velocity-driven, so a static grid cell can't show it — this
     * overlay sweeps two pucks across the screen. The top one carries
     * `FX.motionBlur` and smears along its path; the bottom one is identical but
     * un-blurred, for contrast. Both render sharp at the ends where they stop.
     */
    *motionBlurDemo() {
        const blurred = createRef<Ellipse>();
        const sharp = createRef<Ellipse>();

        const overlay = (
            <Rect width={'fill'} height={'fill'} fill={'bg'} group={'column'} gap={40} padding={60}>
                <Text text={'Motion blur — velocity-driven'} fontSize={28} fill={'white'} width={'fill'} align={'center'} />
                <Rect width={'fill'} height={'fill'} group={'column'} gap={80}>
                    <Ellipse ref={blurred} x={-560} width={120} height={120} fill={'card'} effects={FX.motionBlur(90, 'centered', 16)} />
                    <Ellipse ref={sharp} x={-560} width={120} height={120} fill={'card'} />
                </Rect>
            </Rect>
        );
        this.add(overlay);

        // Fast sweep right → smear; pause (sharp); fast sweep back. The static
        // node tracks the same path without blur.
        for (let i = 0; i < 2; i++) {
            yield* parallel(
                blurred().moveX(560, 0.5, easeInOutQuad),
                sharp().moveX(560, 0.5, easeInOutQuad),
            );
            yield* parallel(
                blurred().moveX(-560, 0.5, easeInOutQuad),
                sharp().moveX(-560, 0.5, easeInOutQuad),
            );
        }
    }
};
