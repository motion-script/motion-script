/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Reference, Text, Rect, Ellipse, Image,
    EffectChain, easeOutQuad,
    Polygon,
    Node,
} from "@motion-script/core";

/**
 * Shared scaffolding for the per-effect showcase scenes.
 *
 * Every effect demo follows the same shape: a labelled card holding the sample
 * `cat.jpg` image (or, for backdrop-reading effects, an Ellipse layered over
 * that image), which animates from an inert starting chain to an active one.
 * Subclasses declare the metadata via {@link EffectDemoScene.spec}; this base
 * builds the card and runs the transition, so each effect file stays a tiny,
 * consistent declaration rather than copy-pasted layout + tween boilerplate.
 */
export interface EffectDemoSpec {
    /** Card heading shown above the sample. */
    label: string;
    /** Inert chain the sample starts in (the effect "off"). */
    from: EffectChain;
    /** Active chain the sample animates to (the effect "on"). */
    to: EffectChain;
    /**
     * When true the effect rides an Ellipse layered *over* the image instead of
     * the image itself. Backdrop-reading effects (backgroundBlur, magnify) need
     * content behind the affected node to be legible — they blur / magnify the
     * image beneath the ellipse.
     */
    background?: boolean;
    /** Seconds for the from → to transition (default 3). */
    duration?: number;
}

export abstract class EffectDemoScene extends Scene {
    /** Declared by each concrete effect scene. */
    abstract readonly spec: EffectDemoSpec;

    *build() {
        this.set({ fill: 'bg' });

        const { label, from, to, background = false, duration = 3 } = this.spec;
        // `any` so the same ref satisfies both the Image and Ellipse `ref` props.
        const ref: Reference<any> = createRef<Node>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect
                    width={'fill'} height={'fill'} clip={true}
                    stroke={{ weight: 2, fill: 'card' }} group={'stack'}
                >
                    {background ? (
                        <Image src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} >
                            <Rect ref={ref} effects={from} width={500} height={500} stroke={{ weight: 1, fill: 'white' }} />
                        </Image>
                    ) : (
                        <Image ref={ref} src={'./cat.jpg'} fit={'fill'} width={'fill'} height={'fill'} effects={from} />
                    )}
                </Rect>
            </Rect>
        );

        yield* ref().to({ effects: to }, duration, easeOutQuad);
    }
}
