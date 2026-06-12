import { FlexDirection } from "@/layout/flex";
import { FlexNode, FlexProps } from "./flex-node";


export interface RowProps extends FlexProps { }


/**
 * Lays its children out left-to-right in a horizontal flex row, honouring `gap`,
 * `alignment`, and `padding`. A convenience wrapper around the same flex layout
 * {@link Rect} performs with `group="row"`, minus the drawn box — use it when you
 * want layout without a visible container.
 */
export class Row extends FlexNode<RowProps> {
    protected readonly direction: FlexDirection = "row";
}
