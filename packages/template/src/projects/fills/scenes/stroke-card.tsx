

import { createRef, Reference, Stage, Text, Rect, Fill, Stroke, Shadow } from "motion-script";

/** Initial paint for the single sample rect {@link strokeCard} builds. */
export interface SampleProps {
    fill?: Fill;
    stroke?: Stroke;
    shadow?: Shadow;
}

/**
 * Shared scaffolding for the richer stroke/shadow showcase scenes.
 *
 * Unlike {@link shapeDemo} — which animates a single fill/stroke from one state
 * to another — these scenes need full control over the sample (multiple stroke
 * layers, dash params, alignment, multiple shadows) and over their own
 * multi-step timeline. This helper paints the labelled card and hands back a ref
 * to the sample {@link Rect}, which the scene generator animates via the node's
 * `strokeTo` / `shadowTo` / `fillTo` generators.
 *
 * Used as:
 *
 *   export default createScene(function* (stage) {
 *     const sample = strokeCard(stage, 'Dash Stroke', { stroke: … });
 *     yield* sample().strokeTo(…);
 *   });
 */
export function strokeCard(stage: Stage, label: string, initial: SampleProps = {}): Reference<Rect> {
    stage.set({ fill: 'bg' });
    const sampleRef = createRef<Rect>();

    stage.add(
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={label} fontSize={96} fill={'gray'} width={'fill'} textAlign={'start'} />
            <Rect width={'fill'} height={'fill'} flow={'horizontal'} gap={80}>
                <Rect
                    ref={sampleRef}
                    width={520} height={520} cornerRadius={32}
                    fill={initial.fill ?? 'card'}
                    stroke={initial.stroke}
                    shadow={initial.shadow}
                />
            </Rect>
        </Rect>
    );

    return sampleRef;
}
