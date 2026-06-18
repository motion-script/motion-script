/** Path geometry: length measurement, dash patterning, arc-length trimming, and shape morphing. */
export { calculatePathLength } from './length';
export { applyDashPattern } from './dash';
export { extractSubpath } from './subpath';
export { createPathSampler } from './sampler';
export type { PathSampler, PathFrame } from './sampler';
export { measurePathData } from './bounds';
export { parsePathString, toPathCommands } from './parse';
export { lerpPath, buildMorph, sampleMorph, toCubicSubpaths } from './morph';
export type { MorphPlan } from './morph';
