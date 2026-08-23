import { FlexDirection } from "@/layout/flex";
import { FlexNode, FlexProps } from "./flex-node";
import { NodeConfig } from "../base/node2d";


export interface RowProps extends FlexProps { }


/**
 * Lays its children out left-to-right in a horizontal flex row, honouring `gap`,
 * `align`, and `padding`. Like {@link Rect} with `flow="horizontal"` it's also a full
 * shape — `fill`, `stroke`, `shadow`, `cornerRadius`, `clip`, and `effects` all
 * apply — but defaults to an invisible box, so it doubles as a pure layout
 * container until you give it paint.
 */
export class Row extends FlexNode<RowProps> {
    protected readonly direction: FlexDirection = "row";

    // this.direction isn't set yet during construction (see FlexNode.applyFlexDefaultSize),
    // so the main axis is passed in directly instead.
    protected override applyDefaultSize(props?: NodeConfig<any, RowProps>): void {
        this.applyFlexDefaultSize(props, "width");
    }
}
