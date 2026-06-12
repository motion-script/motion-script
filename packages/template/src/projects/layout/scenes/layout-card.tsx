/** @jsxImportSource @motion-script/core/jsx */

import { Node, Rect, Text, Reference } from "@motion-script/core";

/**
 * Shared scaffolding for the layout showcase scenes.
 *
 * Every layout demo follows the same shape: a labelled card (heading text on
 * top, content stage filling the rest). The stage is a plain `card`-filled
 * rounded rect; each scene drops its own demo subtree inside. Keeping the
 * chrome here means each scene file stays a tiny, consistent declaration of
 * just the layout it's demonstrating.
 *
 * These are plain helper functions, not JSX components — the JSX runtime only
 * instantiates node *classes* (`new type(props)`), so reusable subtrees are
 * built by calling a function that returns nodes, then interpolating the
 * result (`{layoutCard(...)}`), exactly like the `cell()` helper in the
 * boolean-operators scene.
 *
 * `stage` is the `group` mode for the content rect — the layout being shown
 * off. `children` become that rect's children.
 */
export function layoutCard(opts: {
    label: string;
    stage?: "row" | "column" | "stack";
    gap?: number;
    children: any;
}): Node {
    const { label, stage = "stack", gap = 0, children } = opts;
    return (
        <Rect width={'fill'} height={'fill'} group={'column'} padding={80} gap={24}>
            <Text fontFamily={'Pixelify Sans'} text={label} fontSize={96} fill={'gray'} width={'fill'} align={'start'} />
            <Rect
                width={'fill'} height={'fill'}
                fill={'card'} borderRadius={32} clip={true}
                group={stage} gap={gap} padding={64}
            >
                {children}
            </Rect>
        </Rect>
    );
}

/** A simple swatch tile used as flex/stack content across the layout demos. */
export function tile(opts: {
    ref?: Reference<Rect>;
    color?: string;
    width?: number | 'fill';
    height?: number | 'fill';
    flex?: number;
    borderRadius?: number;
    label?: string;
}): Node {
    const {
        ref, color = 'primary', width = 240, height = 240,
        flex, borderRadius = 24, label,
    } = opts;
    return (
        <Rect
            ref={ref}
            width={width} height={height} flex={flex}
            fill={color} borderRadius={borderRadius}
            group={'stack'}
        >
            {label !== undefined
                ? <Text fontFamily={'Pixelify Sans'} text={label} fontSize={64} fill={'bg'} />
                : []}
        </Rect>
    );
}
