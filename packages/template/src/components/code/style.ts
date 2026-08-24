import { Highlighter, Tag, tagHighlighter, tags as t } from "@lezer/highlight";

/**
 * A single style rule: map one or more Lezer highlight {@link Tag}s to a color.
 * This mirrors a `@codemirror/language` HighlightStyle entry, but instead of
 * emitting CSS class names it carries the color directly — we render to a canvas,
 * not the DOM, so there is no stylesheet to resolve against.
 */
export interface CodeStyleRule {
    tag: Tag | readonly Tag[];
    color: string;
}

/**
 * A code theme: an ordered list of tag→color rules plus a fallback color for any
 * text the parser produces no highlight tag for (operators, punctuation, plain
 * identifiers in some grammars, etc.). Pass a custom one via the Code node's
 * `theme` prop to recolor highlighting without touching the highlighter wiring.
 *
 * @remarks
 * Later rules win when several match the same tag, matching how
 * `@lezer/highlight`'s {@link tagHighlighter} resolves precedence.
 */
export interface CodeHighlightStyle {
    /** Stable name, used as the highlighter cache key. */
    name: string;
    /** Color applied to text with no matching tag. */
    defaultColor: string;
    rules: CodeStyleRule[];
}

/**
 * Motion Canvas's default highlight palette (a Nord-derived theme), ported from
 * `@motion-canvas/2d`'s DefaultHighlightStyle so highlighting matches Motion
 * Canvas token-for-token. Colors and tag groupings are kept identical; only the
 * shape changes (color strings in place of CSS rules).
 */
export const DefaultHighlightStyle: CodeHighlightStyle = {
    name: "motion-canvas-default",
    defaultColor: "#d8dee9",
    rules: [
        { tag: t.keyword, color: "#5e81ac" },
        { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "#88c0d0" },
        { tag: [t.variableName], color: "#8fbcbb" },
        { tag: [t.function(t.variableName)], color: "#8fbcbb" },
        { tag: [t.labelName], color: "#81a1c1" },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#5e81ac" },
        { tag: [t.definition(t.name), t.separator], color: "#a3be8c" },
        { tag: [t.brace], color: "#8fbcbb" },
        { tag: [t.annotation], color: "#d30102" },
        { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#b48ead" },
        { tag: [t.typeName, t.className], color: "#ECEFF4" },
        { tag: [t.operator, t.operatorKeyword], color: "#a3be8c" },
        { tag: [t.tagName], color: "#b48ead" },
        { tag: [t.squareBracket], color: "#ECEFF4" },
        { tag: [t.angleBracket], color: "#ECEFF4" },
        { tag: [t.attributeName], color: "#eceff4" },
        { tag: [t.regexp], color: "#5e81ac" },
        { tag: [t.quote], color: "#b48ead" },
        { tag: [t.string], color: "#a3be8c" },
        { tag: t.link, color: "#a3be8c" },
        { tag: [t.url, t.escape, t.special(t.string)], color: "#8fbcbb" },
        { tag: [t.meta], color: "#88c0d0" },
        { tag: [t.monospace], color: "#d8dee9" },
        { tag: [t.comment], color: "#4c566a" },
        { tag: t.strong, color: "#5e81ac" },
        { tag: t.emphasis, color: "#5e81ac" },
        { tag: t.heading, color: "#5e81ac" },
        { tag: t.special(t.heading1), color: "#5e81ac" },
        { tag: t.heading1, color: "#5e81ac" },
        { tag: [t.heading2, t.heading3, t.heading4], color: "#5e81ac" },
        { tag: [t.heading5, t.heading6], color: "#5e81ac" },
        { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d08770" },
        { tag: [t.processingInstruction, t.inserted], color: "#8fbcbb" },
        { tag: [t.contentSeparator], color: "#ebcb8b" },
        { tag: t.invalid, color: "#434c5e" },
    ],
};

/**
 * GitHub Dark highlight palette, adapted from `@uiw/codemirror-theme-github`.
 * `defaultColor` is GitHub's editor foreground (`#c9d1d9`), used for any text the
 * parser tags don't cover. DOM-only style props (backgroundColor, textDecoration,
 * fontWeight, fontStyle) are dropped — we only color tokens on the canvas.
 */
export const GithubDarkStyle: CodeHighlightStyle = {
    name: "github-dark",
    defaultColor: "#c9d1d9",
    rules: [
        { tag: [t.standard(t.tagName), t.tagName], color: "#7ee787" },
        { tag: [t.comment, t.bracket], color: "#8b949e" },
        { tag: [t.className, t.propertyName], color: "#d2a8ff" },
        { tag: [t.variableName, t.attributeName, t.number, t.operator], color: "#79c0ff" },
        { tag: [t.keyword, t.typeName, t.typeOperator], color: "#ff7b72" },
        { tag: [t.string, t.meta, t.regexp], color: "#a5d6ff" },
        { tag: [t.name, t.quote], color: "#7ee787" },
        { tag: [t.heading, t.strong], color: "#d2a8ff" },
        { tag: [t.emphasis], color: "#d2a8ff" },
        { tag: [t.deleted], color: "#ffdcd7" },
        { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#ffab70" },
        { tag: t.invalid, color: "#f97583" },
    ],
};

/**
 * GitHub Light highlight palette, adapted from `@uiw/codemirror-theme-github`.
 * `defaultColor` is GitHub's editor foreground (`#24292e`). See {@link GithubDarkStyle}
 * for the note on dropped DOM-only style props.
 */
export const GithubLightStyle: CodeHighlightStyle = {
    name: "github-light",
    defaultColor: "#24292e",
    rules: [
        { tag: [t.standard(t.tagName), t.tagName], color: "#116329" },
        { tag: [t.comment, t.bracket], color: "#6a737d" },
        { tag: [t.className, t.propertyName], color: "#6f42c1" },
        { tag: [t.variableName, t.attributeName, t.number, t.operator], color: "#005cc5" },
        { tag: [t.keyword, t.typeName, t.typeOperator], color: "#d73a49" },
        { tag: [t.string, t.meta, t.regexp], color: "#032f62" },
        { tag: [t.name, t.quote], color: "#22863a" },
        { tag: [t.heading, t.strong], color: "#24292e" },
        { tag: [t.emphasis], color: "#24292e" },
        { tag: [t.deleted], color: "#b31d28" },
        { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#e36209" },
        { tag: [t.url, t.escape, t.regexp, t.link], color: "#032f62" },
        { tag: t.invalid, color: "#cb2431" },
    ],
};

/**
 * VS Code Dark+ highlight palette, adapted from the `@uiw/codemirror-theme-vscode`
 * snippet. `defaultColor` is VS Code's editor foreground (`#9cdcfe`). DOM-only
 * style props are dropped; later rules win, matching {@link tagHighlighter}.
 */
export const VscodeDarkStyle: CodeHighlightStyle = {
    name: "vscode-dark",
    defaultColor: "#9cdcfe",
    rules: [
        {
            tag: [
                t.keyword, t.operatorKeyword, t.modifier, t.color,
                t.constant(t.name), t.standard(t.name), t.standard(t.tagName),
                t.special(t.brace), t.atom, t.bool, t.special(t.variableName),
            ],
            color: "#569cd6",
        },
        { tag: [t.controlKeyword, t.moduleKeyword], color: "#c586c0" },
        {
            tag: [
                t.name, t.deleted, t.character, t.macroName, t.propertyName,
                t.variableName, t.labelName, t.definition(t.name),
            ],
            color: "#9cdcfe",
        },
        { tag: t.heading, color: "#9cdcfe" },
        { tag: [t.typeName, t.className, t.tagName, t.changed, t.annotation, t.self, t.namespace], color: "#4ec9b0" },
        { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#dcdcaa" },
        { tag: [t.number], color: "#b5cea8" },
        { tag: [t.operator, t.punctuation, t.separator, t.url, t.escape], color: "#d4d4d4" },
        { tag: [t.regexp], color: "#d16969" },
        { tag: [t.special(t.string), t.processingInstruction, t.string, t.inserted], color: "#ce9178" },
        { tag: [t.angleBracket], color: "#808080" },
        { tag: [t.meta, t.comment], color: "#6a9955" },
        { tag: t.link, color: "#6a9955" },
        { tag: t.invalid, color: "#ff0000" },
    ],
};

/**
 * VS Code Light+ highlight palette, adapted from the `@uiw/codemirror-theme-vscode`
 * snippet. `defaultColor` is VS Code's editor foreground (`#383a42`). See
 * {@link VscodeDarkStyle} for the note on dropped DOM-only style props.
 */
export const VscodeLightStyle: CodeHighlightStyle = {
    name: "vscode-light",
    defaultColor: "#383a42",
    rules: [
        {
            tag: [
                t.keyword, t.operatorKeyword, t.modifier, t.color,
                t.constant(t.name), t.standard(t.name), t.standard(t.tagName),
                t.special(t.brace), t.atom, t.bool, t.special(t.variableName),
            ],
            color: "#0000ff",
        },
        { tag: [t.moduleKeyword, t.controlKeyword], color: "#af00db" },
        {
            tag: [
                t.name, t.deleted, t.character, t.macroName, t.propertyName,
                t.variableName, t.labelName, t.definition(t.name),
            ],
            color: "#0070c1",
        },
        { tag: t.heading, color: "#0070c1" },
        { tag: [t.typeName, t.className, t.tagName, t.changed, t.annotation, t.self, t.namespace], color: "#267f99" },
        { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#795e26" },
        { tag: [t.number], color: "#098658" },
        { tag: [t.operator, t.punctuation, t.separator, t.url, t.escape], color: "#383a42" },
        { tag: [t.regexp], color: "#af00db" },
        { tag: [t.special(t.string), t.processingInstruction, t.string, t.inserted], color: "#a31515" },
        { tag: [t.angleBracket], color: "#383a42" },
        { tag: [t.meta, t.comment], color: "#008000" },
        { tag: t.link, color: "#4078f2" },
        { tag: t.invalid, color: "#e45649" },
    ],
};

/**
 * The built-in themes, keyed by their string name. {@link CodeThemeName} is the
 * union of these keys — pass one of those strings (or any {@link CodeHighlightStyle}
 * object) to a Code node's `theme` prop.
 */
export const BUILTIN_THEMES = {
    // Literal keys (not computed from `.name`) so `keyof` yields a string-literal
    // union for CodeThemeName; these must stay in sync with each style's `name`.
    "motion-canvas-default": DefaultHighlightStyle,
    "github-dark": GithubDarkStyle,
    "github-light": GithubLightStyle,
    "vscode-dark": VscodeDarkStyle,
    "vscode-light": VscodeLightStyle,
} satisfies Record<string, CodeHighlightStyle>;

/** Names of the built-in themes, e.g. `'github-dark' | 'github-light'`. */
export type CodeThemeName = keyof typeof BUILTIN_THEMES;

/**
 * What a Code node's `theme` prop accepts: a built-in theme name (with
 * autocomplete), any other registered theme name, or a {@link CodeHighlightStyle}
 * object passed inline. The `string & {}` keeps the literal-name suggestions while
 * still allowing arbitrary registered names.
 */
export type CodeTheme = CodeThemeName | (string & {}) | CodeHighlightStyle;

// Cache one compiled Highlighter per style name. Compiling builds a tag-rule
// matcher; the parsed result is pure data so it's safe to share across Code nodes.
const compiledByName = new Map<string, Highlighter>();

/**
 * Compile a {@link CodeHighlightStyle} into a `@lezer/highlight` {@link Highlighter}
 * whose "class" output is the literal color string for each tag. Cached by style
 * name so repeated lookups (every tokenize) don't rebuild the matcher.
 */
export function compileStyle(style: CodeHighlightStyle): Highlighter {
    const cached = compiledByName.get(style.name);
    if (cached) return cached;
    const highlighter = tagHighlighter(
        style.rules.map(rule => ({ tag: rule.tag, class: rule.color })),
    );
    compiledByName.set(style.name, highlighter);
    return highlighter;
}
