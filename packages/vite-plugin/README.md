# @motion-script/vite-plugin

Vite plugin for [Motion Script](https://motionscript.dev) projects. It runs a
preview app around your scene during development and produces a self-contained
`dist/` when you build.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import motionScript from '@motion-script/vite-plugin';

export default defineConfig({
  plugins: [motionScript()],
});
```

## What it does

- Resolves your project's entry script (`src/index.ts`, `src/main.tsx`, etc.,
  or an explicit `entry` option) and project file (`src/project.ts`) and wires
  them into the bundled preview app.
- Serves the preview app and its static assets in dev, including
  `canvaskit.wasm` from `@motion-script/canvaskit`, and watches your `public/`
  folder so the asset manifest stays current.
- Emits `canvaskit.wasm` and the preview app's default assets into the build
  output so production builds work without extra setup.

## Options

```ts
motionScript({
  // Explicitly point at the entry file instead of relying on auto-detection.
  entry: 'src/index.tsx',
});
```

## Usage

```bash
npm install @motion-script/vite-plugin
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
pnpm --filter @motion-script/vite-plugin build
pnpm --filter @motion-script/vite-plugin dev
```

