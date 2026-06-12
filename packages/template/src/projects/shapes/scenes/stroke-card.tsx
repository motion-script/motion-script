/** @jsxImportSource @motion-script/core/jsx */

import { Scene, createRef, Text, Rect, ChainableFill, StrokeProp, ShadowProp } from "@motion-script/core";

/** Initial paint for the single sample rect a {@link StrokeCardScene} drives. */
export interface SampleProps {
    fill?: ChainableFill;
    stroke?: StrokeProp | StrokeProp[];
    shadow?: ShadowProp | ShadowProp[];
}

/**
 * Shared scaffolding for the richer stroke/shadow showcase scenes.
 *
 * Unlike {@link ShapeDemoScene} — which animates a single fill/stroke from one
 * state to another — these scenes need full control over the sample (multiple
 * stroke layers, dash params, alignment, multiple shadows) and over their own
 * multi-step timeline. This helper just paints the labelled card and hands back
 * a ref to the sample {@link Rect}, which the subclass animates via the node's
 * `strokeTo` / `shadowTo` / `fillTo` generators in {@link build}.
 */
export abstract class StrokeCardScene extends Scene {
    /** Card heading shown above the sample. */
    abstract readonly label: string;

    /**
     * Build the card chrome around a single sample rect painted with `initial`,
     * and return a ref to it so the subclass can animate it in {@link build}.
     */
    protected card(initial: SampleProps = {}) {
        this.set({ fill: 'bg' });
        const sampleRef = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
                <Text fontFamily={'Pixelify Sans'} text={this.label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
                <Rect width={'fill'} height={'fill'} group={'row'} gap={80}>
                    <Rect
                        ref={sampleRef}
                        width={520} height={520} borderRadius={32}
                        fill={initial.fill ?? 'card'}
                        stroke={initial.stroke}
                        shadow={initial.shadow}
                    />
                </Rect>
            </Rect>
        );

        return sampleRef;
    }
}
