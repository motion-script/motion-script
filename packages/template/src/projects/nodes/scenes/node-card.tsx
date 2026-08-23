

import { Node, Node2D, Rect, Text } from "motion-script";

/**
 * Shared chrome for every node showcase scene.
 * Renders a dark-background card with a label at the top-left and the
 * demo content filling the remaining space.
 */
export function nodeCard(opts: {
    label: string;
    children: any;
    stage?: 'freeform' | 'horizontal' | 'vertical';
    gap?: number;
    padding?: number;
}): Node {
    const { label, children, stage = 'freeform', gap = 0, padding = 80 } = opts;
    return (
        <Rect width={'fill'} height={'fill'} flow={'vertical'} padding={padding} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={label}
                fontSize={80}
                fill={'gray'}
                width={'fill'}
                textAlign={'start'}
            />
            <Rect
                width={'fill'}
                height={'fill'}
                fill={'card'}
                cornerRadius={32}
                clip={true}
                flow={stage}
                gap={gap}
                padding={padding}
            >
                {children}
            </Rect>
        </Rect>
    );
}
