export * from './node';
export * from './props';
export { word, lines, range } from './code-range';
export type { CodeRange } from './code-range';
export { loadCodeLanguage, initSyntaxHighlighter, registerCodeTheme, resolveTheme } from './highlight';
export { DefaultHighlightStyle, GithubDarkStyle, GithubLightStyle, VscodeDarkStyle, VscodeLightStyle, BUILTIN_THEMES, compileStyle } from './style';
export type { CodeHighlightStyle, CodeStyleRule, CodeTheme, CodeThemeName } from './style';
