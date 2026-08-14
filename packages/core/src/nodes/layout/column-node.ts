import { FlexDirection } from "@/layout/flex";
import { FlexNode, FlexProps } from "./flex-node";
import { NodeConfig } from "../base/node";


export interface ColumnProps extends FlexProps { }


/**
 * Lays its children out top-to-bottom in a vertical flex column, honouring
 * `gap`, `align`, and `padding`. Like {@link Rect} with `flow="vertical"` it's
 * also a full shape — `fill`, `stroke`, `shadow`, `cornerRadius`, `clip`, and
 * `effects` all apply — but defaults to an invisible box, so it doubles as a
 * pure layout container until you give it paint.
 */
export class Column extends FlexNode<ColumnProps> {
    protected readonly direction: FlexDirection = "column";

    // this.direction isn't set yet during construction (see FlexNode.applyFlexDefaultSize),
    // so the main axis is passed in directly instead.
    protected override applyDefaultSize(props?: NodeConfig<any, ColumnProps>): void {
        this.applyFlexDefaultSize(props, "height");
    }
}
