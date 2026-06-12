import { TransformState } from "./transform";

/**
 * Per-shape descriptor state. Shapes carry geometry and a *local* transform
 * (`rotation`/`scale` baked into the path before it joins the union) but **not**
 * layer effects: effects are applied to the whole drawn union via
 * {@link Graphics.effects}, not per shape. So `ShapeState` omits
 * `TransformState.effects` (which remains for node-level transforms).
 */
export interface ShapeState extends Omit<TransformState, "effects"> {
    start: number;
    end: number;
}