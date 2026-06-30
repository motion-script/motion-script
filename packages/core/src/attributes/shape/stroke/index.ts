/** Stroke prop and resolved types, resolver, and array lerp. */
export type { Stroke, StrokeProp, StrokeAlign, StrokeCap, StrokeJoin } from './mapper';
/** @internal */ export type { StrokeResolved } from './mapper';
/** @internal */ export { resolveStroke, resolveStrokeArray, resolveStrokeAlign, resolveStrokeCap, resolveStrokeJoin } from './mapper';

/** @internal */ export { lerpStrokeArray } from './lerp';
