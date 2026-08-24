// The Latex "engine": MathJax-backed glyph-path building and morph
// interpolation, kept separate from node.ts so `ms add latex` can copy just
// the node declaration and import this behind `@motion-script/latex` instead
// (see registry-index.ts, which is what actually gets copied).
export { buildLatexPath } from './geometry';
export type { LatexToken, LatexPathResult } from './geometry';
export { prepareLatexTween as defaultLatexMorph } from './tween';
export type { AnimatedToken, LatexMorphStrategy } from './tween';
