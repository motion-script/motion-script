// The Code "engine": syntax highlighting, tokenizing, layout, diffing, and
// transition/phase scheduling — kept separate from node.ts so `ms add code`
// can copy just the node declaration and import this behind
// `@motion-script/code` instead (see registry-index.ts, which is what
// actually gets copied).
export * from './transitions';
export * from './layout';
export { drawCode } from './render';
export type { DrawCodeState } from './render';
export { diffCode as defaultCodeDiff } from './diff';
export type { CodeDiffStrategy, CodeEdit } from './diff';
export { loadCodeLanguage, initSyntaxHighlighter, ensureHighlighter, registerCodeTheme, resolveTheme, canHighlight } from './highlight';
export { tokenizeCodeToIdLines } from './tokens';
export type { IdLine, IdToken } from './tokens';
export { DefaultHighlightStyle, GithubDarkStyle, GithubLightStyle, VscodeDarkStyle, VscodeLightStyle, BUILTIN_THEMES, compileStyle } from './style';
export type { CodeHighlightStyle, CodeStyleRule, CodeTheme, CodeThemeName } from './style';
export { TokenAdvanceCache } from './measure-cache';
export { word, lines, rangeToCharOffsets, charOffsetsToRange, CodeRanges, CodeRangeChain } from './code-range';
export type { CodeRange } from './code-range';
