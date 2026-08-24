---
"@motion-script/code": minor
"@motion-script/latex": minor
---

`ms add code`/`ms add latex` now copy a single thin file (`code.ts`/`latex.ts`)
instead of the whole package — the algorithmic engine (syntax highlighting,
diffing, layout, transition/phase scheduling, rendering, MathJax glyph-path
building, morph interpolation) stays behind `@motion-script/code`/
`@motion-script/latex` as a real npm dependency, the same way shadcn keeps
Base UI behind its copied components instead of inlining it.

**New public exports** (both packages, from the same `.` entry point):
previously-internal engine pieces are now part of the supported API, since
the copied node needs to import them — `layoutCode`, `diffCode`
(as `defaultCodeDiff`), `TokenAdvanceCache`, everything in `transitions.ts`,
`ensureHighlighter`, `rangeToCharOffsets`/`charOffsetsToRange`,
`prepareLatexTween` (as `defaultLatexMorph`), `buildLatexPath`, and the new
`drawCode` render function code's node delegates to. Purely additive.

**New pluggable strategies**, each a construction-time-only option (not a
reactive `@property` — a strategy *is* a function, and the reactive prop
system can't distinguish "this function is my value" from "this function
computes my value"):
- `<Code diffStrategy={...}>` — decides which token became which across an
  edit. Defaults to `defaultCodeDiff`.
- `<Code phaseStrategy={...}>` — decides *when* each part of a structural
  edit happens (fade-out/reflow/fade-in timing). Defaults to
  `defaultCodePhases`.
- `<Latex morph={...}>` — decides how tokens interpolate between two
  formulas. Defaults to `defaultLatexMorph`.

**`CodeRanges`**, a chainable multi-range builder over `word`/`lines`
mirroring `Fills`/`FillChain`: `CodeRanges.lines(2).word(5, 1, 3)`.
`Code.highlight()` now accepts a `CodeRange` or any `Iterable<CodeRange>`
(a chain, or a plain array) and highlights the union.

**Fix**: the package barrel's `LatexProps` re-export was a plain
`export { LatexProps }` rather than `export type { LatexProps }`. `tsc`'s
whole-program compilation always dropped this type-only interface from the
published `dist/` correctly regardless, so this had no effect on consumers
of the built package — but matters once `ms add`-copied source runs through
a per-file transpiler (Vite/esbuild) directly.
