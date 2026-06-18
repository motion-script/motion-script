/** @jsxImportSource @motion-script/core/jsx */

import { Node, Rect, Text } from "@motion-script/core";

/**
 * Shared chrome for every node showcase scene.
 * Renders a dark-background card with a label at the top-left and the
 * demo content filling the remaining space.
 */
export function nodeCard(opts: {
    label: string;
    children: any;
    stage?: 'stack' | 'row' | 'column';
    gap?: number;
    padding?: number;
}): Node {
    const { label, children, stage = 'stack', gap = 0, padding = 80 } = opts;
    return (
        <Rect width={'fill'} height={'fill'} group={'column'} padding={padding} gap={24}>
            <Text
                fontFamily={'Pixelify Sans'}
                text={label}
                fontSize={80}
                fill={'gray'}
                width={'fill'}
                align={'start'}
            />
            <Rect
                width={'fill'}
                height={'fill'}
                fill={'card'}
                cornerRadius={32}
                clip={true}
                group={stage}
                gap={gap}
                padding={padding}
            >
                {children}
            </Rect>
        </Rect>
    );
}
