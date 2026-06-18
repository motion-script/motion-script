import { defineConfig } from 'vite'
import path from 'path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => {
  const isServe = command === 'serve';

  return {
    base: './',
    root: isServe ? path.resolve(__dirname, 'examples') : __dirname,
    publicDir: isServe ? path.resolve(__dirname, 'public') : false,
    plugins: [
      react(),
      tailwindcss(),
      ...(isServe
        ? []
        : [
            dts({
              tsconfigPath: './tsconfig.build.json',
              entryRoot: 'src',
            }),
          ]),
    ],

    // canvaskit.js is CJS-only (no ESM default export); pre-bundling it through
    // esbuild's CJS->ESM interop synthesizes the default export getter.ts expects.
    optimizeDeps: {
      include: ['@motion-script/canvaskit'],
    },

    server: {
      port: 5174,
      fs: {
        allow: [
          path.resolve(__dirname, '..', '..'),
        ],
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    },

    build: {
      target: 'esnext',
      minify: false,
      sourcemap: true,
      lib: {
        entry: {
          'motion-script-player': 'src/index.ts',
        },
        formats: ['es'],
      },
      rolldownOptions: {
        // Externalize React *and* the @motion-script workspace packages. Core
        // and web define runtime identity that the user's scene also depends on
        // (the fill registry keyed by `type`, the Node tree shape, instanceof
        // checks). Bundling them here ships a *second* copy inside the player,
        // so a consuming project that installs its own @motion-script/core ends
        // up with two divergent cores: the scene builds nodes/fills with one and
        // the player interprets them with the other. That mismatch surfaces as
        // `Fill "undefined" is not registered` and `node.waveform is not a
        // function` once the published player's frozen copy drifts from the
        // freshly-installed project copy. Keeping them external means the player
        // resolves a single shared core/web from the consumer at runtime (the
        // vite-plugin declares them as deps and dedupes them). React was already
        // external for the same single-instance reason.
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          /use-sync-external-store/,
          /^@motion-script\//,
        ],
        output: {
          assetFileNames: 'motion-script-player[extname]',
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
})
