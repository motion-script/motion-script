/** @jsxImportSource @motion-script/core/jsx */

import { Node, Rect, Text } from "@motion-script/core";

/**
 * Shared chrome for every text showcase scene: one heading at the top and a
 * `card`-filled stage filling the rest, holding whatever cells/content the
 * scene drops in. Mirrors the `nodeCard`/`layoutCard` helpers used by the
 * nodes/layout showcases — call this once per scene, not once per item.
 */
export function textCard(opts: {
    label: string;
    children: any;
    stage?: 'stack' | 'row' | 'column';
    gap?: number;
    padding?: number;
}): Node {
    const { label, children, stage = 'stack', gap = 0, padding = 80 } = opts;
    return (
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={label} fontSize={80} fill={'gray'} width={'fill'} textAlign={'start'} />
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

/** A small bordered cell with its own caption — used for side-by-side items inside a `textCard`'s stage. */
export function textCell(opts: {
    caption: string;
    children: any;
    width?: number | 'fill';
    height?: number | 'fill';
}): Node {
    const { caption, children, width = 'fill', height = 'fill' } = opts;
    return (
        <Rect width={width} height={height} group={'column'} gap={20}>
            <Text text={caption} fontSize={28} fontWeight={700} fill={'gray'} width={'fill'} textAlign={'center'} />
            <Rect width={'fill'} height={'fill'} group={'stack'}>
                {children}
            </Rect>
        </Rect>
    );
}
