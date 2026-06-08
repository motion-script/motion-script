import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone-app build of the player (NOT the library build in vite.config.ts).
//
// This compiles index.html + src/main.tsx — i.e. the player rendering the
// example ShapeScene — into a fully self-contained static bundle that the docs
// site embeds in an <iframe> at /editor for complete isolation.
//
// Output goes straight into the docs static/ folder so Docusaurus serves it at
// /player/index.html. canvaskit.wasm + the example's public assets are emitted
// alongside the bundle so the build is self-contained (no dev-server middleware).

const packageRoot = __dirname;
const playerRoot = path.resolve(packageRoot, 'examples');
const docsStaticPlayer = path.resolve(packageRoot, '..', 'site', 'static', 'player');

// Locate canvaskit.wasm inside the installed @motion-script/canvaskit package
// so the production bundle ships its own copy (the docs dev server has no wasm
// middleware). Mirrors scripts/copy-wasm.js / the vite-plugin's resolver.
function resolveCanvasKitWasm(): string | null {
  const require = createRequire(import.meta.url);
  try {
    const wasmPath = path.join(
      path.dirname(require.resolve('@motion-script/canvaskit/package.json')),
      'canvaskit.wasm',
    );
    return fs.existsSync(wasmPath) ? wasmPath : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  root: playerRoot,
  // Served from /player/ on the docs site, so asset URLs must be prefixed.
  base: '/player/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'motion-script-player-app-assets',
      // After the bundle is written, drop canvaskit.wasm next to it so the
      // runtime request for ./canvaskit.wasm resolves against the static build.
      closeBundle() {
        const wasmPath = resolveCanvasKitWasm();
        if (wasmPath) {
          fs.copyFileSync(wasmPath, path.join(docsStaticPlayer, 'canvaskit.wasm'));
        } else {
          this.warn(
            'Could not resolve @motion-script/canvaskit — the embedded player will fail to ' +
              'load CanvasKit. Run `pnpm install` at the repo root.',
          );
        }
      },
    },
  ],
  build: {
    outDir: docsStaticPlayer,
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    // The engine derives a Scene's display name from `constructor.name`
    // (core Node.name getter), which the scene panel renders. Minifiers
    // (including rolldown's scope-hoisting renamer, which runs before terser
    // and which keep_classnames can't undo) mangle class names, so scene
    // labels come out blank in a minified build even though they work in the
    // player's unminified dev server. The library build disables minification
    // for the same reason — do the same here. gzip keeps the transfer small.
    minify: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(packageRoot, 'src'),
    },
  },
});
