export type { Corners, CornersInput } from "./per-corner";
/** @internal */ export { resolveCorners, lerpCorners, isUniformCorners } from "./per-corner";

/** @internal */ export type { CornerRadiusResolved, RectCornerRadius } from "./corner-radius";
/** @internal */ export { isUniformCornerRadiusInput, isUniformCornerRadius, getUniformCornerRadius, isZeroCornerRadius, resolveCornerRadius, lerpCornerRadius } from "./corner-radius";

export type { CornerStyle } from "./corner-style";
/** @internal */ export type { CornerStyleResolved, RectCornerStyle } from "./corner-style";
/** @internal */ export { resolveCornerStyle, lerpCornerStyle } from "./corner-style";

/** @internal */ export { lerpCornerScalarStyle } from "./corner-scalar";
