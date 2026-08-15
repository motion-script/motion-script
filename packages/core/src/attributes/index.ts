export * from './shape/corners';
export * from './shape/effects';
export * from './shape/fill';
// The renderer-facing half of the SkSL plumbing. Surfaced for the same reason
// `resolveVideoTimestamp` is: the marshalling rules are part of the shader fill's
// contract, so the backend consumes core's definition rather than reimplementing
// it. Named rather than wildcard because `SkSLUniform`/`SkSLUniformValue` already
// reach the barrel through `./shape/effects`.
export {
    normalizeUniforms, lerpUniformValue, lerpUniformRecord,
    uniformValuesEqual, uniformRecordsEqual,
    describeUniforms, writeUniforms, coordsMatrix, parseShaderChildren,
} from './shape/sksl-uniforms';
export type {
    SkSLUniformRecord, UniformReflect, UniformSlot, UniformBounds, ShaderChildDecl,
} from './shape/sksl-uniforms';
export * from './shape/filters';
export * from './shape/path';

export * from './shape/path';
export * from './shape/shadow';
export * from './shape/stroke';
export { Sound, SoundProps } from './audio/sound';
export type { AudioRequest } from './audio/request';
export * from './audio/filters';
export * from './layout';
export * from './mask/boolean';
export * from './mask/mask';
export * from './text/align';
export * from './text/lerp';
export * from './text/span';
export { property, getPropertyMeta, PropOptions } from './properties/decorator';
export type { PropertyMeta } from './properties/decorator';
export {
    fillProperty, strokeProperty, shadowProperty, effectsProperty, colorProperty,
    cornerRadiusProperty, cornerStyleProperty, pathProperty,
    insetsProperty, anchorProperty, vector2Property, sizeProperty,
    textProperty,
} from './properties/typed';
export type { AttributePropOptions } from './properties/typed';