import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Anything that should NOT be bundled into the published library. React and the
// workspace packages are peer/runtime deps the consumer already has, so keeping
// them external avoids duplicate copies and keeps the bundle tiny + tree-shakable.
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@motion-script/core',
  '@motion-script/web',
];
// Also externalize deep subpath imports (e.g. "@motion-script/core/jsx/...").
const isExternal = (id: string) =>
  EXTERNAL.includes(id) || id.startsWith('@motion-script/');

export default defineConfig(({ command }) => {
  // `vite` / `vite dev`: serve the runnable playground under examples/.
  // `vite build`: produce the tree-shakable library from src/.
  const isServe = command === 'serve';

  return {
    base: './',
    // During dev, treat examples/ as the web root so its index.html and
    // test-harness.html resolve. public/ (served assets + canvaskit.wasm) stays
    // at the package root via publicDir.
    root: isServe ? path.resolve(__dirname, 'examples') : __dirname,
    publicDir: isServe ? path.resolve(__dirname, 'public') : false,
    plugins: [
      react(),
      // Only emit declarations during the library build.
      ...(isServe
        ? []
        : [
          dts({
            tsconfigPath: './tsconfig.build.json',
            entryRoot: 'src',
          }),
        ]),
    ],
    // @motion-script/web is served from its prebuilt dist (it's externalized
    // below), and that dist still contains a bare `import CanvasKitInit from
    // "@motion-script/canvaskit"`. That package ships only a CommonJS/UMD bundle
    // with no ESM `export default`, so the browser's native ESM loader chokes on
    // it. Pre-bundling it here runs it through esbuild's CJS->ESM interop, which
    // synthesizes the default export the import expects.
    optimizeDeps: {
      include: ['@motion-script/canvaskit'],
    },
    server: {
      port: 5174,
      fs: {
        // Allow importing the live library source (../src) and workspace packages.
        allow: [path.resolve(__dirname, '..', '..')],
      },
      headers: {
        // CanvasKit needs cross-origin isolation for SharedArrayBuffer.
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    build: {
      target: 'esnext',
      // Consumer apps bundle + minify this; shipping readable code keeps their
      // source maps useful and lets their bundler tree-shake freely.
      minify: false,
      sourcemap: true,
      lib: {
        entry: {
          'motion-script-react': path.resolve(__dirname, 'src/index.ts')
        },
        formats: ['es'],
      },
      rolldownOptions: {
        external: isExternal,
        treeshake: true,
      },
    },
  };
});
