/** @jsxImportSource @motion-script/core/jsx */

import {
    Scene, createRef, Text, Rect, Path,
    Fills, Fill, easeInOutQuad, wait, tween,
} from "@motion-script/core";
import { BuildStage } from "@motion-script/core";

const PATHS = [
    // Arrow right
    'M 0 40 L 80 40 L 80 0 L 160 80 L 80 160 L 80 120 L 0 120 Z',
    // Star
    'M 80 0 L 99 55 L 160 55 L 112 89 L 129 145 L 80 110 L 31 145 L 48 89 L 0 55 L 61 55 Z',
    // Heart
    'M 80 140 C 80 140 0 90 0 45 C 0 20 20 0 45 0 C 60 0 75 10 80 25 C 85 10 100 0 115 0 C 140 0 160 20 160 45 C 160 90 80 140 80 140 Z',
    // Diamond
    'M 80 0 L 160 80 L 80 160 L 0 80 Z',
];

/**
 * Showcases the Path node by cross-fading through a set of SVG path shapes.
 * Since `d` is immutable, each transition replaces the node while fading
 * out the old one and fading in the new one.
 */
export class PathScene extends Scene {
    *build(_stage: BuildStage) {
        this.set({ fill: 'bg' });

        const fill: Fill = Fills.color('#6990DD');
        const stroke: Fill = Fills.color('#E8617C');
        const strokeWeight = 12;

        const fillContainerRef = createRef<Rect>();
        const strokeContainerRef = createRef<Rect>();

        this.add(
            <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={32}>
                <Text
                    fontFamily={'Pixelify Sans'}
                    text={'Path'}
                    fontSize={80}
                    fill={'gray'}
                    width={'fill'}
                    align={'start'}
                />
                <Rect width={'fill'} height={'fill'} group={'row'} gap={80} alignment={{ x: 0, y: 0 }}>
                    <Rect
                        ref={fillContainerRef}
                        width={500} height={500}
                        group={'stack'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                    <Rect
                        ref={strokeContainerRef}
                        width={500} height={500}
                        group={'stack'}
                        fill={'card'}
                        cornerRadius={24}
                    />
                </Rect>
            </Rect>
        );

        const mountPath = (container: Rect, d: string, props: Record<string, any>) => {
            const node = (
                <Path
                    d={d}
                    width={280} height={280}
                    fill={props.fill}
                    stroke={props.stroke}
                    opacity={1}
                />
            ) as Path;
            container.addChild(node);
            return node;
        };

        let fillNode = mountPath(fillContainerRef(), PATHS[0], { fill });
        let strokeNode = mountPath(strokeContainerRef(), PATHS[0], { stroke: { weight: strokeWeight, fill: stroke } });

        yield* wait(0.5);

        for (let i = 1; i < PATHS.length; i++) {
            const nextD = PATHS[i];

            // Fade out old, mount new at opacity 0, fade in new — simultaneously
            const nextFill = mountPath(fillContainerRef(), nextD, { fill });
            const nextStroke = mountPath(strokeContainerRef(), nextD, { stroke: { weight: strokeWeight, fill: stroke } });
            nextFill.set({ opacity: 0 });
            nextStroke.set({ opacity: 0 });

            const prevFill = fillNode;
            const prevStroke = strokeNode;

            yield* tween(1.2, t => {
                const eased = easeInOutQuad(t);
                prevFill.set({ opacity: 1 - eased });
                prevStroke.set({ opacity: 1 - eased });
                nextFill.set({ opacity: eased });
                nextStroke.set({ opacity: eased });
            });

            prevFill.dispose();
            prevStroke.dispose();
            fillContainerRef().removeChild(prevFill);
            strokeContainerRef().removeChild(prevStroke);

            fillNode = nextFill;
            strokeNode = nextStroke;

            if (i < PATHS.length - 1) yield* wait(0.8);
        }

        yield* wait(0.5);
    }
}
