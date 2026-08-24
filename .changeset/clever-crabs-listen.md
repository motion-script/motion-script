---
"motion-script": major
"@motion-script/cli": minor
---

`Code` and `Latex` move to an opt-in registry instead of shipping as hard
dependencies of `motion-script`.

**Removed.** `motion-script` no longer re-exports `Code`/`Latex` (and their
supporting exports — `word`/`lines`/`loadCodeLanguage`/theme helpers,
`buildLatexPath`, etc.), and no longer depends on `@motion-script/code` /
`@motion-script/latex`. Every consumer of `motion-script` was pulling in both
packages' dependencies (14 `@lezer/*` grammar packages, `@mathjax/src`)
regardless of whether they used either node.

**Migration.** Run `ms add code` and/or `ms add latex` in your project (first
run `ms init` if you don't already have a `components.json`). This copies the
component's source directly into your project under
`src/components/<name>/` — full source, not a compiled dependency, so it's
yours to customize — and installs the npm packages it actually needs. Update
your imports from `import { Code } from 'motion-script'` to
`import { Code } from '@/components/code'` (same for `Latex`); every other
import from `'motion-script'` is unaffected.

**New.** `@motion-script/cli` gains `ms init` (writes `components.json`, wires
a `@/components/*` tsconfig path alias) and `ms add [name...]` (copies
component source from a registry, resolving `registryDependencies` and
installing npm `dependencies`). The registry protocol mirrors shadcn/ui's:
a default registry is built into the CLI, and `components.json`'s
`registries` field can point additional/private, namespaced registries
(`@ns/name`) at any URL, with `${VAR}`-interpolated auth headers.
`@motion-script/vite-plugin` picks up `components.json` automatically (when
present) to resolve the configured alias — no `vite.config.ts` changes
needed.
