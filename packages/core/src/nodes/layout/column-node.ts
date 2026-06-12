import { FlexDirection } from "@/layout/flex";
import { FlexNode, FlexProps } from "./flex-node";


export interface ColumnProps extends FlexProps { }


/**
 * Lays its children out top-to-bottom in a vertical flex column, honouring
 * `gap`, `alignment`, and `padding`. A convenience wrapper around the same flex
 * layout {@link Rect} performs with `group="column"`, minus the drawn box — use
 * it when you want layout without a visible container.
 */
export class Column extends FlexNode<ColumnProps> {
    protected readonly direction: FlexDirection = "column";
}
