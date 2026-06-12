import { FillSpace } from "@motion-script/core";
import { DrawDemoScene } from "./draw-demo";

/**
 * `parent`: the gradient resolves against the parent node's layout rect (the
 * card), so it stays pinned to the card while the figure drifts through it — the
 * shape acts like a moving window onto a fill anchored to its container. A faded
 * copy of the same gradient fills the card so the slice the figure reveals lines
 * up with the field behind it.
 */
export class ParentSpaceScene extends DrawDemoScene {
    readonly space: FillSpace = 'parent';
    readonly label = 'Fill Space — parent';
    readonly backdrop = 'parent' as const;
}
