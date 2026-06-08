# @motion-script/code

Animated, syntax-highlighted code blocks for [Motion Script](https://motionscript.dev).
The `Code` node tokenizes source with [Shiki](https://shiki.style) and animates
edits at the token level, so appending, inserting, removing, replacing, and
highlighting code all morph smoothly instead of snapping.

```tsx
import { Scene, createRef } from '@motion-script/core';
import { Code, lines, word } from '@motion-script/code';

export class CodeScene extends Scene {
  *build() {
    const code = createRef<Code>();

    this.add(
      <Code
        ref={code}
        language="typescript"
        theme="github-dark"
        fontSize={28}
        code={`function greet(name) {\n  return "hi";\n}`}
      />,
    );

    yield* code().append('\ngreet("world");', 0.6);
    yield* code().highlight(lines(2), 0.4);
    yield* code().replace(word(2, 10, 4), '`hi, ${name}`', 0.6);
  }
}
```

## What's in here

- **`Code`** node, a hugging block of syntax-highlighted source. Set `code`,
  `language`, and `theme` to switch what is shown; tune `fontSize`,
  `fontFamily`, `lineHeight`, `letterSpacing`, `showLineNumbers`,
  `lineNumberGap`, and `padding` for layout.
- **Token-level transitions**, generator methods you `yield*` from a scene:
  - `append(code, duration)` / `prepend(code, duration)`, fade in lines at the
    end or start.
  - `insert([line, col], code, duration)`, splice code into a line or grow new
    lines mid-document.
  - `remove(range, duration)`, collapse tokens (and whole lines) so surrounding
    text reflows.
  - `replace(range, next, duration)`, cross-fade old tokens out and new ones in.
  - `highlight(range, duration)` / `resetHighlight(duration)`, dim everything
    outside the range, then restore it.
- **Range helpers**, `word(line, col, length)`, `lines(from, to)`, and
  `range(startLine, startCol, endLine, endCol)` build the `CodeRange` values the
  transitions take. `findFirstRange`, `findRangeAt`, and `findAllRanges` locate
  ranges by matching literal text.
- **`initSyntaxHighlighter(themes, langs)`**, optional preloading of Shiki
  themes and languages so the first frame renders fully highlighted.

Every token keeps a stable identity across edits, so concurrent animations at
different positions do not clobber each other while one is mid-flight.

This package builds on [`@motion-script/core`](../../core) (the scene graph and
animation runtime) and renders through whatever backend draws the scene, such as
[`@motion-script/web`](../../web).

## Usage

```bash
npm install @motion-script/code
```

For a guided setup, scaffold a project instead with:

```bash
npm create motion-script@latest
```

See the [docs](https://motionscript.dev/docs) for the full feature set and API
reference.

## Development

From the monorepo root:

```bash
pnpm --filter @motion-script/code build
pnpm --filter @motion-script/code test
```
