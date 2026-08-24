---
"@motion-script/latex": patch
---

`LatexProps` is now re-exported with `export type` from the package barrel,
not a plain `export`. `tsc`'s whole-program compilation always dropped this
type-only interface from the published `dist/` correctly regardless, so this
had no effect on consumers of the built package — but a per-file transpiler
(e.g. Vite/esbuild, which `ms add latex` copied source now runs through
directly) can't infer that a named re-export is type-only without the
`type` keyword, and previously emitted a broken runtime import.
