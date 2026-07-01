# @motion-script/site

The [Motion Script](https://motionscript.dev) documentation site: a Next.js
app that renders the guides, node/effect/filter reference, and blog from MDX
content, plus interactive live-code demos backed by the bundled player.

## What's in here

- **`app/`**: Next.js App Router routes: docs, blog, API reference, and the
  in-browser scene editor.
- **`content/docs/`**: the guides and reference pages (getting started,
  nodes, effects, audio filters, image filters, attributes) as MDX.
- **`content/blog/`**: release announcements.
- **`components/docs/`**: React components used inside MDX, including
  `node-scenes.tsx`, which renders the live scene previews next to code
  samples.
- **`lib/versions.ts`**: tracks the current `@motion-script/core` version for
  version switching in the docs.

## Development

From the monorepo root:

```bash
pnpm --filter @motion-script/site dev
```

This builds the embedded player app and the search index, then starts the
Next.js dev server.

```bash
pnpm --filter @motion-script/site build
pnpm --filter @motion-script/site start
```

## Writing docs

Add or edit MDX files under `content/docs/<section>/`. Code samples that
import from `@motion-script/core`, `@motion-script/code`, or
`@motion-script/latex` should only use symbols that are actually exported.
Check `packages/motion-script/src/index.ts` (the flagship re-export) if
you're unsure a name is current.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide on adding a
new node, effect, or filter page.
