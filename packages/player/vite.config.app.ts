import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone-app build of the player (NOT the library build in vite.config.ts).
//
// This compiles examples/index.html + examples/main.tsx — i.e. the player
// rendering the example LayoutScene — into a fully self-contained static bundle
// that the site embeds in an <iframe> at /editor for complete isolation.
//
// The output is written into the Next.js site's public/ folder so it is served
// at /player/index.html. canvaskit.wasm ships as a hashed asset alongside the
// bundle because examples/main.tsx imports it via `?url`; that emitted URL is
// what the runtime's `locateFile` resolves to, so no manual wasm copy is needed.

const packageRoot = __dirname;
const appRoot = path.resolve(packageRoot, 'examples');
const sitePublicPlayer = path.resolve(packageRoot, '..', 'site', 'public', 'player');

export default defineConfig({
  root: appRoot,
  // `root` is examples/, which has no public/ of its own — point Vite at the
  // package's public folder (the same one the dev server serves) so the tab
  // icon index.html references is emitted alongside the bundle.
  publicDir: path.resolve(packageRoot, 'public'),
  // Served from /player/ on the site, so asset URLs must be prefixed.
  base: '/player/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: sitePublicPlayer,
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
