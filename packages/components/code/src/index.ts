export * from './node';
export * from './props';
export { word, lines } from './code-range';
export type { CodeRange } from './code-range';
export { loadCodeLanguage, initSyntaxHighlighter, registerCodeTheme, resolveTheme, canHighlight } from './highlight';
// The tokenizer the node itself draws with, so an editor beside the canvas can
// colour a listing the *same* way rather than a similar way. Exported rather
// than reimplemented for exactly that reason: two highlighters over one string
// is a promise nobody can keep, and the near-match is worse than plain text
// because it looks authoritative.
export { tokenizeCodeToIdLines } from './tokens';
export type { IdLine, IdToken } from './tokens';
export { DefaultHighlightStyle, GithubDarkStyle, GithubLightStyle, VscodeDarkStyle, VscodeLightStyle, BUILTIN_THEMES, compileStyle } from './style';
export type { CodeHighlightStyle, CodeStyleRule, CodeTheme, CodeThemeName } from './style';
