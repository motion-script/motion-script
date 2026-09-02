import { createAnimationScene, type NodeSpec } from "@motion-script/core";

/**
 * A layout of text cards, as rows.
 *
 * The nesting a JSX tree carried in its shape is carried here by `parent` and
 * `order`. That is more to read, and it is what makes the tree addressable: a
 * command names `autofit` directly, and moving a card under a different parent
 * is one field rather than a structural rewrite.
 */
const CARD = "card";

/** Sugar for the row shape, so the structure below stays legible. */
const node = (
    id: string,
    type: string,
    props: Record<string, unknown>,
    parent: string | null = null,
    order = 0,
): NodeSpec => ({ id, type, parent, order, props });

const NODES: NodeSpec[] = [
    node("grid", "rect", { gap: 40, width: "fill", height: "fill", flow: "vertical" }),

    node("top", "rect", { width: "fill", height: "fill", gap: 40 }, "grid", 0),
    node("rich-card", "rect",
        { cornerRadius: 20, width: "fill", height: "fill", fill: CARD, padding: 20 }, "top", 0),
    node("rich", "richtext", {
        spans: [{ text: "hello" }, { text: " world", fill: "red", fontSize: 60 }],
        fontSize: 40,
        fill: "white",
    }, "rich-card", 0),

    node("fit-card", "rect",
        { cornerRadius: 20, width: "fill", height: "fill", fill: CARD }, "top", 1),
    node("fit-box", "rect", {
        width: 400, height: 400, cornerRadius: 20,
        stroke: { fill: "orange", weight: 10 }, padding: 40,
    }, "fit-card", 0),
    node("autofit", "text", {
        text: "Hello world!", fill: "white", fontSize: "autofit", wrap: true, minFontSize: 40,
    }, "fit-box", 0),

    node("bottom", "rect", { width: "fill", height: "fill", gap: 40 }, "grid", 1),
    node("stroke-card", "rect", {
        cornerRadius: 20, width: "fill", height: "fill",
        flow: "vertical", gap: 20, fill: CARD, padding: 20,
    }, "bottom", 0),
    node("stroked-1", "text",
        { text: "Hello", fontSize: 100, stroke: { weight: 2, fill: "white" } }, "stroke-card", 0),
    node("stroked-2", "text",
        { text: "World", fontSize: 200, stroke: { weight: 2, fill: "white", dash: 5 } }, "stroke-card", 1),

    node("blurb-card", "rect",
        { cornerRadius: 20, width: "fill", height: "fill", fill: CARD, padding: 20 }, "bottom", 1),
    node("blurb", "text", {
        text: "Motion Script! This is a wonderful app filled with powerful tools for animation and video making.",
        fontSize: "autofit", minFontSize: 40, fill: "white", wrap: true,
    }, "blurb-card", 0),
];

/**
 * The tree arrives at 0, then three text commands run back to back.
 *
 * Sequencing is arithmetic: each `at` is the previous command's `at + duration`.
 * Nothing suspends, so asking for the frame at 5s costs one evaluation rather
 * than five seconds of replay.
 */
const TextScene = createAnimationScene({
    kind: "animation",
    root: { fill: "bg", flow: "vertical", gap: 20, padding: 40 },
    commands: [
        // Every node arrives at 0. Order here is irrelevant — a node's place in
        // the tree is `parent`/`order`, not where its `add` sits in this list.
        ...NODES.map((n) => ({
            id: `add-${n.id}`,
            type: "add",
            target: null,
            at: 0,
            params: { node: n },
        })),
        {
            id: "retext", type: "to", target: "autofit", at: 0, duration: 2,
            params: { props: { text: "Hello world! and this is cool" } },
        },
        {
            id: "append", type: "append", target: "autofit", at: 2, duration: 2,
            params: { text: " Appending more text." },
        },
        {
            id: "prepend", type: "prepend", target: "autofit", at: 4, duration: 2,
            params: { text: "Prepended: " },
        },
    ],
});

export default TextScene;
