import { PaddingProps, ShapeProps } from "@motion-script/core";

export interface LatexProps extends ShapeProps {
    latex: string;
    fontSize: number;
    padding: PaddingProps;
}