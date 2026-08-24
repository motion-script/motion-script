---
"@motion-script/vite-plugin": minor
---

The plugin now probes for a `components.json` at the project root (the file `ms init`/`ms add` write) and, when present, registers its `aliases.components` string as a Vite alias pointing at `paths.components`, so `import { X } from '@/components/...'` resolves without the user ever touching their own `vite.config.ts`. Entirely additive: a project without `components.json` sees no behavior change, and the alias never overrides the user's own `vite.config.ts` aliases since Vite merges them independently. A malformed or unreadable `components.json` degrades to "no alias registered" with a console warning rather than breaking the dev server.
