import { ShapeState } from "./shape";

export interface LatexState extends ShapeState {
    latex: string;
    fontSize: number;
}

