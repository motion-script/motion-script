import { TransformState } from "./transform";

export interface ShapeState extends TransformState {
    start: number;
    end: number;
}