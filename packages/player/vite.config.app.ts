import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone-app build of the player (NOT the library build in vite.config.ts).
//
// This compiles examples/index.html + examples/main.tsx — i.e. the player
// rendering the example LayoutScene — into a fully self-contained static bundle
// that the docs site embeds in an <iframe> at /editor for complete isolation.
//
// The output is written into the docs static/ folder so Docusaurus serves it at
// /player/index.html. canvaskit.wasm ships as a hashed asset alongside the
// bundle because examples/main.tsx imports it via `?url`; that emitted URL is
// what the runtime's `locateFile` resolves to, so no manual wasm copy is needed.

const packageRoot = __dirname;
const appRoot = path.resolve(packageRoot, 'examples');
const docsStaticPlayer = path.resolve(packageRoot, '..', 'site', 'static', 'player');

export default defineConfig({
  root: appRoot,
  // Served from /player/ on the docs site, so asset URLs must be prefixed.
  base: '/player/',
  plugins: [react(), tailwindcss()],
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
