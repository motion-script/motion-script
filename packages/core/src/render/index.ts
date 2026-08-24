/** @internal */ export * from './descriptors/ellipse';
/** @internal */ export * from './descriptors/rect';

/** @internal */ export * from './descriptors/text';
/** @internal */ export * from './descriptors/richtext';


/** @internal */ export * from './descriptors/transform';
/** @internal */ export * from './descriptors/shape';

/** @internal */ export * from './descriptors/path';
/** @internal */ export * from './descriptors/path-builder';
/** @internal */ export * from './descriptors/line';
/** @internal */ export * from './descriptors/polygon';
/** @internal */ export * from './descriptors/polygram';

/** @internal */ export { Graphics2D } from './graphics2d';
/** @internal */ export type { GraphicsOp, GraphicsShapeOp, GraphicsTransform } from './graphics2d';

/** @internal */ export { Clip } from './clip';
/** @internal */ export type { ClipOp, ClipShapeOp } from './clip';
/** @internal */ export { containsClip, containsOps, pointInPolygon, nearPolyline, distanceToSegment, polygonVertices, polygramVertices } from './clip-contains';

/** @internal */ export type { RenderContext2D, RenderPass2D } from './render-context2d';
/** @internal */ export type { SpaceRect, SpaceRects, NodeRenderState, EffectTarget, RasterizedSurface } from './render-context2d';
/** @internal */ export { CanvasRenderContext2D } from './canvas-render-context2d';
/** @internal */ export type { Measurer2D } from "./measurer";
// Public rather than internal: a host drawing its own text caret reads these off
// `getTextLayout`, so they are part of the editor-facing surface.
export { caretCount } from './text-layout';
export type { TextBlockLayout, TextBlockLine, TextBlockSource } from './text-layout';
/** @internal */ export { NullRenderContext } from './null-render-context';

