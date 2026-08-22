---
"@motion-script/cli": major
"@motion-script/create": major
"@motion-script/core": minor
---

The CLI is now the whole build: `@motion-script/player` and `@motion-script/vite-plugin` are removed

A Motion Script project no longer has a bundler configuration of its own. `@motion-script/cli` supplies the entire Vite setup and starts its dev server with `configFile: false`, so a project is just `src/project.ts` and its scenes — delete your `vite.config.*`.

**Removed packages.** `@motion-script/player` (the timeline editor UI) and `@motion-script/vite-plugin` are gone. Everything the plugin did that a render needs moved into the CLI: the `?scene` import suffix, the `parseData` build-time macro, the virtual `~asset-manifest`, the bundled default fonts (Inter, Fira Mono), `canvaskit.wasm` serving, and the `three` alias for 3D scenes. Renders are byte-for-byte what they were.

**Migrating a project.**

- Delete `vite.config.*`.
- Drop `@motion-script/vite-plugin` from `devDependencies`; keep (or add) `@motion-script/cli` and `vite` (a peer dependency of the CLI).
- Replace `/// <reference types="@motion-script/vite-plugin/project" />` with `/// <reference types="@motion-script/cli/project" />`.
- Replace the `dev` script. There is no dev server to start; use `ms list`, `ms screenshot <when>` and `ms export`.
- A JavaScript project now needs a `tsconfig.json` for its JSX settings — Vite reads `jsx`/`jsxImportSource` from `tsconfig.json` only, and ignores `jsconfig.json`. Scaffolded JS projects ship one.

**Dropped with the player.** The disk-backed precomp cache (`.motion-script/`) is gone. Its only writer was the player's full precomp pass; the render path measures with `lifespans: false` and never wrote to it, so with the player removed the cache could no longer fill.

**New in core.** `@motion-script/core/csv` exposes `parseCSV` on a Node-loadable subpath. Core's main entry is emitted for a bundler (extensionless relative specifiers), which Node's ESM loader rejects; the CLI's `parseData` macro runs in Node and needs the parser there.
